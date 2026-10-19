import type { Response } from 'express';
import { setRefreshCookie } from './auth-cookies';

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

describe('setRefreshCookie', () => {
  const lastCookie = (expiresAt?: Date) => {
    const cookie = jest.fn();
    setRefreshCookie(
      { cookie } as unknown as Response,
      'token',
      true,
      expiresAt,
    );
    return cookie.mock.calls[0];
  };

  it('ends with the token it carries, so the browser never keeps a dead cookie', () => {
    // a one-day session policy (1440 minutes)
    const options = lastCookie(new Date(Date.now() + 1440 * MINUTE_MS))[2];

    expect(options.maxAge).toBeGreaterThan(1440 * MINUTE_MS - 1000);
    expect(options.maxAge).toBeLessThanOrEqual(1440 * MINUTE_MS);
  });

  it('keeps a TV (GUEST) cookie for a year when its token lasts a year', () => {
    const options = lastCookie(new Date(Date.now() + 365 * DAY_MS))[2];

    expect(options.maxAge).toBeGreaterThan(365 * DAY_MS - 1000);
  });

  it('never goes negative for a token that is already over', () => {
    expect(lastCookie(new Date(Date.now() - 5000))[2].maxAge).toBe(0);
  });

  it('falls back to 7 days when the caller does not know the expiry (SSO exchange)', () => {
    expect(lastCookie()[2].maxAge).toBe(7 * DAY_MS);
  });

  it('stays HttpOnly, Secure, strict and scoped to the auth routes', () => {
    expect(lastCookie(new Date(Date.now() + DAY_MS))[2]).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/auth',
    });
  });
});
