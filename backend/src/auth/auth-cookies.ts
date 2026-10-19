import type { Request, Response, CookieOptions } from 'express';

export const ACCESS_COOKIE_NAME = 'access_token';
export const REFRESH_COOKIE_NAME = 'refresh_token';

/** Used when the caller does not know the token expiry (SSO ticket exchange). */
const DEFAULT_REFRESH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function buildCookieOptions(
  isProd: boolean,
  path: string,
  maxAge: number,
): CookieOptions {
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: 'strict',
    path,
    maxAge,
  };
}

export function setAccessCookie(
  res: Response,
  accessToken: string,
  expiresInSeconds: number,
  isProd: boolean,
): void {
  res.cookie(
    ACCESS_COOKIE_NAME,
    accessToken,
    buildCookieOptions(isProd, '/api', expiresInSeconds * 1000),
  );
}

export function setRefreshCookie(
  res: Response,
  refreshToken: string,
  isProd: boolean,
  expiresAt?: Date,
): void {
  // The cookie ends with the token it carries, so the browser never keeps a dead one.
  const maxAge = expiresAt
    ? Math.max(expiresAt.getTime() - Date.now(), 0)
    : DEFAULT_REFRESH_COOKIE_MAX_AGE_MS;
  res.cookie(
    REFRESH_COOKIE_NAME,
    refreshToken,
    buildCookieOptions(isProd, '/api/auth', maxAge),
  );
}

export function clearAccessCookie(res: Response, isProd: boolean): void {
  res.clearCookie(ACCESS_COOKIE_NAME, buildCookieOptions(isProd, '/api', 0));
}

export function clearRefreshCookie(res: Response, isProd: boolean): void {
  res.clearCookie(
    REFRESH_COOKIE_NAME,
    buildCookieOptions(isProd, '/api/auth', 0),
  );
}

export function getAccessTokenFromCookie(req: Request): string | null {
  return req.cookies?.[ACCESS_COOKIE_NAME] ?? null;
}
