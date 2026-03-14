import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * CSRF protection guard — three-layer defense in depth:
 *
 *  Layer 1 (X-Requested-With): Classic AJAX header, always accepted.
 *  Layer 2 (Origin): OWASP-recommended primary check.
 *  Layer 3 (Referer): Fallback for browsers that omit Origin on same-origin POST.
 *
 * Allowed origins are computed from environment configuration so that
 * dev, staging, and production can all be handled without code changes.
 */
@Injectable()
export class CsrfTokenGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    const corsOrigin = this.configService.get<string>('CORS_ORIGIN', '');

    const origins: string[] = [];

    if (nodeEnv !== 'production') {
      origins.push(
        'http://localhost:5173',
        'http://localhost:3000',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
      );
    }

    if (corsOrigin) {
      corsOrigin
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
        .forEach((o) => origins.push(o));
    }

    this.allowedOrigins = new Set(origins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    // Layer 1: X-Requested-With — always accepted
    if (request.headers['x-requested-with'] === 'XMLHttpRequest') {
      return true;
    }

    // Layer 2: Origin header (preferred by OWASP)
    const origin = request.headers['origin'];
    if (origin && this.allowedOrigins.has(origin)) {
      return true;
    }

    // Layer 3: Referer header (some browsers omit Origin on same-origin POST)
    const referer = request.headers['referer'];
    if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (this.allowedOrigins.has(refererOrigin)) {
          return true;
        }
      } catch {
        // Malformed referer — reject
      }
    }

    throw new ForbiddenException(
      'CSRF validation failed: request must include a valid X-Requested-With header or originate from a trusted Origin',
    );
  }
}
