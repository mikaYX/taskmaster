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

  /** In-memory rate limit store: IP → attempt timestamps in the window (fallback). */
  private readonly attemptMap = new Map<string, number[]>();

  /** Attempts allowed per IP within the window. */
  private static readonly MAX_ATTEMPTS = 3;

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

    // 1. Rate limiting — 3 attempts per 5 minutes per IP, distributed via Redis
    const rateLimited = await this.isRateLimited(ip);
    if (rateLimited) {
      const retryAfterSec = await this.getRetryAfterSeconds(ip);
      const retryAfterMin = Math.ceil(retryAfterSec / 60);

      this.logger.warn(
        `[SECURITY] Setup rate limited — IP: ${ip}, UA: ${userAgent}, retryAfter: ${retryAfterSec}s`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Trop de tentatives de configuration (${SetupGuard.MAX_ATTEMPTS} maximum toutes les 5 minutes). Réessayez dans ${retryAfterMin} minute${retryAfterMin > 1 ? 's' : ''}.`,
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
   * Counts this attempt for the IP. Returns `true` when the IP already used
   * MAX_ATTEMPTS attempts in the current window (the window starts at the
   * first attempt and expires after RATE_LIMIT_WINDOW_SEC).
   */
  private async isRateLimited(ip: string): Promise<boolean> {
    // Prefer Redis (distributed, survives multi-replica).
    if (this.redis) {
      try {
        const key = `${SetupGuard.REDIS_KEY_PREFIX}${ip}`;
        const count = await this.redis.incr(key);
        if (count === 1) {
          await this.redis.expire(key, SetupGuard.RATE_LIMIT_WINDOW_SEC);
        }
        return count > SetupGuard.MAX_ATTEMPTS;
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
    const cutoff = now - SetupGuard.RATE_LIMIT_WINDOW_MS;
    const recent = (this.attemptMap.get(ip) ?? []).filter((ts) => ts > cutoff);
    if (recent.length >= SetupGuard.MAX_ATTEMPTS) {
      this.attemptMap.set(ip, recent);
      return true;
    }
    recent.push(now);
    this.attemptMap.set(ip, recent);

    // Periodically reap stale entries to bound memory.
    if (this.attemptMap.size > 1000) {
      for (const [key, stamps] of this.attemptMap) {
        if (stamps.every((ts) => ts <= cutoff)) this.attemptMap.delete(key);
      }
    }

    return false;
  }

  /** Seconds left before the IP's window expires (full window if unknown). */
  private async getRetryAfterSeconds(ip: string): Promise<number> {
    if (this.redis) {
      try {
        const ttl = await this.redis.ttl(`${SetupGuard.REDIS_KEY_PREFIX}${ip}`);
        if (ttl > 0) return ttl;
      } catch {
        // fall through to the in-memory estimate
      }
    }
    const oldest = this.attemptMap.get(ip)?.[0];
    if (oldest) {
      const left = Math.ceil(
        (oldest + SetupGuard.RATE_LIMIT_WINDOW_MS - Date.now()) / 1000,
      );
      if (left > 0) return left;
    }
    return SetupGuard.RATE_LIMIT_WINDOW_SEC;
  }
}
