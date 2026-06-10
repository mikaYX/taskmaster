import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
  Inject,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

/**
 * SetupGuard — Security gate for the initial setup endpoint.
 *
 * Enforces:
 * 1. Bootstrap secret presence in environment
 * 2. Distributed rate limiting via Redis (1 attempt / 5 min / IP), with an
 *    in-memory fallback if Redis is momentarily unavailable
 * 3. Structured security logging of every attempt
 *
 * AUDIT.md Finding #14: the previous in-memory `Map` was per-process, which
 * let an attacker bypass the limit in multi-replica deployments (1 attempt
 * per pod). We now SET-NX in Redis with EXpiration so any pod will see the
 * same lock. If Redis is unreachable the guard logs a warning and falls
 * back to the local map — fail-closed-enough behaviour since the bootstrap
 * secret remains the primary barrier and the `@Throttle()` decorator on the
 * controller is still active.
 */
@Injectable()
export class SetupGuard implements CanActivate {
  private readonly logger = new Logger('SetupGuard');

  /** In-memory rate limit store: IP → last attempt timestamp (fallback). */
  private readonly attemptMap = new Map<string, number>();

  /** Rate limit window in milliseconds (5 minutes) */
  private static readonly RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

  /** Rate limit window in seconds — Redis EX uses seconds. */
  private static readonly RATE_LIMIT_WINDOW_SEC = 5 * 60;

  /** Redis key prefix for setup rate limiting. */
  private static readonly REDIS_KEY_PREFIX = 'setup:rate:';

  constructor(
    private readonly configService: ConfigService,
    // Optional so the guard can still boot when RedisModule is not loaded
    // in narrow unit tests; behaviour falls back to in-memory map.
    @Optional() @Inject(REDIS_CLIENT) private readonly redis?: Redis,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    // 1. Rate limiting — 1 attempt per 5 minutes per IP, distributed via Redis
    const rateLimited = await this.isRateLimited(ip);
    if (rateLimited) {
      const retryAfterSec = SetupGuard.RATE_LIMIT_WINDOW_SEC;

      this.logger.warn(
        `[SECURITY] Setup rate limited — IP: ${ip}, UA: ${userAgent}, retryAfter: ${retryAfterSec}s`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many setup attempts. Retry after ${retryAfterSec} seconds.`,
          retryAfter: retryAfterSec,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Bootstrap secret must be configured server-side before first setup
    const expectedSecret = this.configService.get<string>('BOOTSTRAP_SECRET');

    if (!expectedSecret) {
      this.logger.warn(
        `[SECURITY] Setup blocked because BOOTSTRAP_SECRET is missing — IP: ${ip}, UA: ${userAgent}`,
      );
      throw new ForbiddenException(
        'BOOTSTRAP_SECRET is missing from the server environment. Define it in the .env file before running the setup wizard.',
      );
    }

    this.logger.log(
      `[SECURITY] Setup attempt authorized — IP: ${ip}, UA: ${userAgent}`,
    );

    return true;
  }

  /**
   * Atomically test-and-set the rate-limit token for this IP.
   * Returns `true` when the IP is currently rate-limited (key already
   * existed, SET NX returned null), `false` when the attempt is allowed
   * (key was created and now expires in RATE_LIMIT_WINDOW_SEC).
   */
  private async isRateLimited(ip: string): Promise<boolean> {
    // Prefer Redis (distributed, survives multi-replica).
    if (this.redis) {
      try {
        const result = await this.redis.set(
          `${SetupGuard.REDIS_KEY_PREFIX}${ip}`,
          Date.now().toString(),
          'EX',
          SetupGuard.RATE_LIMIT_WINDOW_SEC,
          'NX',
        );
        // `set ... NX` returns 'OK' when the key was set, `null` when the
        // key already existed → an attempt happened in the last window.
        return result === null;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[SECURITY] Setup rate-limit Redis failure (${message}) — falling back to in-memory map`,
        );
        // Fall through to in-memory path.
      }
    }

    // Fallback: in-memory map (single-process only).
    const now = Date.now();
    const lastAttempt = this.attemptMap.get(ip);
    if (lastAttempt && now - lastAttempt < SetupGuard.RATE_LIMIT_WINDOW_MS) {
      return true;
    }
    this.attemptMap.set(ip, now);

    // Periodically reap stale entries to bound memory.
    if (this.attemptMap.size > 1000) {
      const cutoff = now - SetupGuard.RATE_LIMIT_WINDOW_MS;
      for (const [key, ts] of this.attemptMap) {
        if (ts < cutoff) this.attemptMap.delete(key);
      }
    }

    return false;
  }
}
