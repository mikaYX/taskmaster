import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';

// ─── Décorateur ──────────────────────────────────────────────────────────────

export const AUTH_RATE_LIMIT_KEY = 'auth:rate_limit_type';

export enum AuthRateLimitType {
  LOGIN = 'login',
  REFRESH = 'refresh',
}

export const AuthRateLimit = (type: AuthRateLimitType) =>
  SetMetadata(AUTH_RATE_LIMIT_KEY, type);

// ─── Configuration des fenêtres ──────────────────────────────────────────────

interface RateLimitWindow {
  /** Préfixe Redis pour la clé */
  prefix: string;
  /** Durée de la fenêtre en secondes */
  windowSeconds: number;
  /** Nombre max de requêtes dans la fenêtre */
  maxRequests: number;
  /** Si true, utilise le username comme discriminant (au lieu de l'IP) */
  useUsername?: boolean;
  /** Nom lisible pour les logs et headers */
  label: string;
}

const RATE_LIMIT_CONFIG: Record<AuthRateLimitType, RateLimitWindow[]> = {
  [AuthRateLimitType.LOGIN]: [
    // Fenêtre courte par IP : protection anti-burst immédiat
    {
      prefix: 'rl:login:ip:60',
      windowSeconds: 60,
      maxRequests: 5,
      label: 'login-ip-short',
    },
    // Fenêtre moyenne par IP : protection anti-brute-force lent
    {
      prefix: 'rl:login:ip:900',
      windowSeconds: 900,
      maxRequests: 10,
      label: 'login-ip-sustained',
    },
    // Fenêtre par username : protection contre attaque distribuée sur un compte
    {
      prefix: 'rl:login:user:900',
      windowSeconds: 900,
      maxRequests: 10,
      useUsername: true,
      label: 'login-user-sustained',
    },
  ],
  [AuthRateLimitType.REFRESH]: [
    // Fenêtre courte par IP : protection anti-hammering du token
    {
      prefix: 'rl:refresh:ip:60',
      windowSeconds: 60,
      maxRequests: 30,
      label: 'refresh-ip-short',
    },
    // Fenêtre moyenne par IP : protection contre rotation abusive continue
    {
      prefix: 'rl:refresh:ip:300',
      windowSeconds: 300,
      maxRequests: 60,
      label: 'refresh-ip-sustained',
    },
  ],
};

// Script Lua atomique : INCR + EXPIRE uniquement à la création de la clé.
// Garantit qu'une clé expirée et recréée repart bien à 1 sans race condition.
const LUA_INCR_WITH_TTL = `
  local current = redis.call('INCR', KEYS[1])
  if current == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
  end
  return current
`;

// ─── Guard ───────────────────────────────────────────────────────────────────

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimitGuard.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const type = this.reflector.get<AuthRateLimitType>(
      AUTH_RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // Pas de métadonnée sur ce handler → le guard laisse passer
    if (!type) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const ip = this.extractIp(req);
    const username =
      type === AuthRateLimitType.LOGIN
        ? String(req.body?.username ?? '').toLowerCase().trim()
        : '';

    const windows = RATE_LIMIT_CONFIG[type];

    for (const win of windows) {
      const discriminant =
        win.useUsername && username ? username : ip;
      const key = `${win.prefix}:${discriminant}`;

      const count = await this.atomicIncrement(key, win.windowSeconds);

      const remaining = Math.max(0, win.maxRequests - count);

      // Headers informatifs pour le client et les load-balancers
      res.setHeader(`X-RateLimit-${win.label}-Limit`, win.maxRequests);
      res.setHeader(`X-RateLimit-${win.label}-Remaining`, remaining);
      res.setHeader(
        `X-RateLimit-${win.label}-Reset`,
        win.windowSeconds,
      );

      if (count > win.maxRequests) {
        this.logger.warn(
          `[AUTH-RATE-LIMIT] 429 — type=${type} window=${win.label} key=${key} count=${count}/${win.maxRequests}`,
        );

        res.setHeader('Retry-After', String(win.windowSeconds));

        throw new HttpException(
          {
            statusCode: HttpStatus.TOO_MANY_REQUESTS,
            message: 'Trop de tentatives, veuillez réessayer plus tard.',
            retryAfter: win.windowSeconds,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  private extractIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const first = Array.isArray(forwarded)
        ? forwarded[0]
        : forwarded.split(',')[0];
      return first.trim();
    }
    return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
  }

  /**
   * Incrémente le compteur de manière atomique via un script Lua.
   * L'expiration n'est posée qu'à la création de la clé (window fixe).
   */
  private async atomicIncrement(
    key: string,
    windowSeconds: number,
  ): Promise<number> {
    const result = await (this.redis as Redis).eval(
      LUA_INCR_WITH_TTL,
      1,
      key,
      String(windowSeconds),
    );
    return typeof result === 'number' ? result : parseInt(String(result), 10);
  }
}
