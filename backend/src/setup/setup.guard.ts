import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SetupGuard — Security gate for the initial setup endpoint.
 *
 * Enforces:
 * 1. Bootstrap secret presence in environment
 * 2. In-memory rate limiting (1 attempt / 5 min / IP)
 * 3. Structured security logging of every attempt
 */
@Injectable()
export class SetupGuard implements CanActivate {
  private readonly logger = new Logger('SetupGuard');

  /** In-memory rate limit store: IP → last attempt timestamp */
  private readonly attemptMap = new Map<string, number>();

  /** Rate limit window in milliseconds (5 minutes) */
  private static readonly RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const userAgent = request.headers['user-agent'] || 'unknown';

    // 1. Rate limiting — 1 attempt per 5 minutes per IP
    const lastAttempt = this.attemptMap.get(ip);
    const now = Date.now();

    if (lastAttempt && now - lastAttempt < SetupGuard.RATE_LIMIT_WINDOW_MS) {
      const retryAfterSec = Math.ceil(
        (SetupGuard.RATE_LIMIT_WINDOW_MS - (now - lastAttempt)) / 1000,
      );

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

    // Record this attempt
    this.attemptMap.set(ip, now);

    // Cleanup old entries periodically (prevent memory leak)
    if (this.attemptMap.size > 1000) {
      const cutoff = now - SetupGuard.RATE_LIMIT_WINDOW_MS;
      for (const [key, ts] of this.attemptMap) {
        if (ts < cutoff) this.attemptMap.delete(key);
      }
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
}
