import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  Logger,
  Inject,
} from '@nestjs/common';
import { Observable, of, throwError, from } from 'rxjs';
import { catchError, tap, switchMap, map } from 'rxjs/operators';
import Redis from 'ioredis';
import { Request, Response } from 'express';
import { REDIS_CLIENT } from '../redis/redis.module';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);
  private readonly TTL = 86400; // 24 hours

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const httpContext = context.switchToHttp();
    const req = httpContext.getRequest<Request>();
    const res = httpContext.getResponse<Response>();
    const idempotencyKey = req.headers['x-idempotency-key'] as string;

    if (!idempotencyKey) {
      return next.handle();
    }

    // Scope the key: userId + method + path + clientKey
    const user = (req as any).user;
    const userId = user ? user.sub || user.id : 'anon';
    // We hash the key or use it directly? keys are strings.
    const redisKey = `idempotency:${userId}:${req.method}:${req.path}:${idempotencyKey}`;

    const cached = await this.redis.get(redisKey);

    if (cached) {
      const data = JSON.parse(cached);
      if (data.status === 'PENDING') {
        this.logger.warn(`Idempotency conflict for key: ${redisKey}`);
        throw new ConflictException(
          'Request with this Idempotency-Key is currently processing',
        );
      }
      if (data.status === 'COMPLETED') {
        this.logger.log(`Idempotency hit for key: ${redisKey}`);
        res.setHeader('X-Idempotency-Hit', 'true');
        return of(data.response);
      }
    }

    // Mark as PENDING
    await this.redis.set(
      redisKey,
      JSON.stringify({ status: 'PENDING' }),
      'EX',
      this.TTL,
    );

    return next.handle().pipe(
      // Use concatMap to ensure Redis set completes before response (safety)
      switchMap((response) =>
        from(
          this.redis.set(
            redisKey,
            JSON.stringify({ status: 'COMPLETED', response }),
            'EX',
            this.TTL,
          ),
        ).pipe(map(() => response)),
      ),
      catchError((err) => {
        this.logger.error(
          `Processing failed for key: ${redisKey}, clearing idempotency.`,
        );
        // Clean up key on error so it can be retried
        return from(this.redis.del(redisKey)).pipe(
          switchMap(() => throwError(() => err)),
        );
      }),
    );
  }
}
