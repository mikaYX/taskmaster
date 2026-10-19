import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/** `https://app.example.com/some/path` -> `https://app.example.com` (undefined if unparsable). */
const originOf = (value: string): string | undefined => {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

/**
 * CSRF protection guard — a request must come from the application itself:
 *
 *  1. Fetch Metadata: browsers on a secure context (HTTPS, localhost) send
 *     `Sec-Fetch-Site`; page scripts cannot set it. `same-origin` means the
 *     request was made by a page of the very origin it targets, whatever
 *     reverse proxy sits in between. `same-site` and `cross-site` are not
 *     accepted here.
 *  2. Origin (then Referer when Origin is absent) must be trusted: the
 *     configured public URLs (CORS_ORIGIN, FRONTEND_URL, BACKEND_URL), or the
 *     address the request was actually sent to (scheme + Host), which an
 *     attacking site cannot be: the app's cookies are scoped to that host.
 *
 * X-Requested-With can still be sent by the frontend but is not sufficient on its own.
 *
 * Without these, a server reached through an address that is not listed in
 * CORS_ORIGIN (a host name, an IIS/ARR front end) refused every token refresh
 * with 403, which the browser treats as "session invalid": everybody was signed
 * out each time the 15-minute access token expired.
 */
@Injectable()
export class CsrfTokenGuard implements CanActivate {
  private readonly logger = new Logger(CsrfTokenGuard.name);
  private readonly allowedOrigins: Set<string>;
  /** Rejected origins already reported, to keep the log readable. */
  private readonly reported = new Set<string>();

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

    // The public address of the app is configured in several places; trust all of them.
    for (const key of ['FRONTEND_URL', 'BACKEND_URL']) {
      const configured = this.configService.get<string>(key, '');
      const origin = configured ? originOf(configured) : undefined;
      if (origin) origins.push(origin);
    }

    this.allowedOrigins = new Set(origins);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (request.headers['sec-fetch-site'] === 'same-origin') {
      return true;
    }

    const origin = request.headers['origin'];
    const referer = request.headers['referer'];
    const refererOrigin = referer ? originOf(referer) : undefined;

    const host = request.get('host');
    const ownOrigin = host ? `${request.protocol}://${host}` : undefined;

    for (const candidate of [origin, refererOrigin]) {
      if (!candidate) continue;
      if (this.allowedOrigins.has(candidate) || candidate === ownOrigin) {
        return true;
      }
    }

    const seen = origin ?? refererOrigin ?? '(none)';
    if (!this.reported.has(seen)) {
      this.reported.add(seen);
      this.logger.warn(
        `Request refused: origin ${seen} is not trusted (trusted: ${[...this.allowedOrigins].join(', ') || 'none'}). ` +
          'If this is the address users type in their browser, set CORS_ORIGIN (and FRONTEND_URL/BACKEND_URL) to it in .env and restart the service.',
      );
    }

    throw new ForbiddenException(
      'CSRF validation failed: request must originate from a trusted Origin or Referer',
    );
  }
}
