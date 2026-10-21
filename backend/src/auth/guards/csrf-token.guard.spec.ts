import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CsrfTokenGuard } from './csrf-token.guard';

type Headers = Record<string, string | undefined>;

const config = (values: Record<string, string>) =>
  ({
    get: (key: string, fallback = '') => values[key] ?? fallback,
  }) as never;

const context = (headers: Headers, protocol = 'https') => {
  const lower = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: lower,
        protocol,
        get: (name: string) => lower[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
};

const PROD = { NODE_ENV: 'production', CORS_ORIGIN: 'http://localhost:3000' };

describe('CsrfTokenGuard', () => {
  describe('what must stay refused (cross-site requests)', () => {
    const guard = new CsrfTokenGuard(config(PROD));

    it('refuses a request from another site', () => {
      expect(() =>
        guard.canActivate(
          context({
            origin: 'https://evil.example',
            host: 'app.example.com',
            'sec-fetch-site': 'cross-site',
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('refuses a sibling sub-domain: same-site is not same-origin', () => {
      expect(() =>
        guard.canActivate(
          context({
            origin: 'https://blog.example.com',
            host: 'app.example.com',
            'sec-fetch-site': 'same-site',
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('refuses a request with no Origin and no Referer (curl, scripts)', () => {
      expect(() =>
        guard.canActivate(context({ host: 'app.example.com' })),
      ).toThrow(ForbiddenException);
    });

    it('refuses a foreign Referer, and a malformed one', () => {
      expect(() =>
        guard.canActivate(
          context({
            referer: 'https://evil.example/page',
            host: 'app.example.com',
          }),
        ),
      ).toThrow(ForbiddenException);
      expect(() =>
        guard.canActivate(
          context({ referer: 'not a url', host: 'app.example.com' }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('does not let an attacker origin pass by claiming the same host name elsewhere', () => {
      expect(() =>
        guard.canActivate(
          context({
            origin: 'https://app.example.com.evil.example',
            host: 'app.example.com',
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('ignores a forged-looking value that is not exactly same-origin', () => {
      expect(() =>
        guard.canActivate(
          context({
            origin: 'https://evil.example',
            'sec-fetch-site': 'same-origin; cross-site',
          }),
        ),
      ).toThrow(ForbiddenException);
    });

    it('does not trust localhost in production unless configured', () => {
      const strict = new CsrfTokenGuard(config({ NODE_ENV: 'production' }));

      expect(() =>
        strict.canActivate(
          context({ origin: 'http://localhost:3000', host: 'app.example.com' }),
        ),
      ).toThrow(ForbiddenException);
    });
  });

  describe('what the application itself sends', () => {
    const guard = new CsrfTokenGuard(config(PROD));

    it('accepts the configured origin', () => {
      expect(
        guard.canActivate(context({ origin: 'http://localhost:3000' }, 'http')),
      ).toBe(true);
    });

    it('accepts same-origin Fetch Metadata whatever the public address is (reverse proxy, host name)', () => {
      expect(
        guard.canActivate(
          context({
            origin: 'https://taskmaster.example.com',
            host: 'localhost:3000',
            'sec-fetch-site': 'same-origin',
          }),
        ),
      ).toBe(true);
    });

    it('accepts the address the request was actually sent to (browsers without Fetch Metadata, plain HTTP on a LAN)', () => {
      expect(
        guard.canActivate(
          context(
            {
              origin: 'http://WIN-AT6E7T41UKI:3000',
              host: 'WIN-AT6E7T41UKI:3000',
            },
            'http',
          ),
        ),
      ).toBe(true);
    });

    it('accepts a trusted Referer when Origin is absent', () => {
      expect(
        guard.canActivate(
          context({ referer: 'http://localhost:3000/settings' }, 'http'),
        ),
      ).toBe(true);
    });
  });

  describe('configured addresses', () => {
    it('trusts every address of CORS_ORIGIN, comma separated', () => {
      const guard = new CsrfTokenGuard(
        config({
          NODE_ENV: 'production',
          CORS_ORIGIN: 'https://a.example, https://b.example',
        }),
      );

      expect(guard.canActivate(context({ origin: 'https://a.example' }))).toBe(
        true,
      );
      expect(guard.canActivate(context({ origin: 'https://b.example' }))).toBe(
        true,
      );
    });

    it('also trusts FRONTEND_URL and BACKEND_URL, reduced to their origin', () => {
      const guard = new CsrfTokenGuard(
        config({
          NODE_ENV: 'production',
          CORS_ORIGIN: 'http://localhost:3000',
          FRONTEND_URL: 'https://tasks.example.com/app/',
          BACKEND_URL: 'https://api.example.com',
        }),
      );

      expect(
        guard.canActivate(context({ origin: 'https://tasks.example.com' })),
      ).toBe(true);
      expect(
        guard.canActivate(context({ origin: 'https://api.example.com' })),
      ).toBe(true);
    });

    it('ignores an unparsable FRONTEND_URL instead of failing to start', () => {
      expect(
        () =>
          new CsrfTokenGuard(
            config({ NODE_ENV: 'production', FRONTEND_URL: '%%%' }),
          ),
      ).not.toThrow();
    });

    it('trusts the usual localhost ports outside production', () => {
      const guard = new CsrfTokenGuard(config({ NODE_ENV: 'development' }));

      expect(
        guard.canActivate(context({ origin: 'http://localhost:5173' }, 'http')),
      ).toBe(true);
    });
  });
});
