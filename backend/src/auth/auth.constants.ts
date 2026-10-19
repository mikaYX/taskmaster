/**
 * Cryptographic constants for the Auth module.
 *
 * Centralised so every code path (login, password change, setup wizard, etc.)
 * uses the same bcrypt cost — addresses AUDIT.md Finding #11 which flagged
 * an inconsistency between `auth.service` (cost 12) and `setup.service`
 * (cost 10).
 */

/**
 * bcrypt cost for hashing user passwords.
 *
 * 12 is the project baseline. Do not lower without a security review.
 */
export const BCRYPT_ROUNDS = 12;

/** What a TV (GUEST) screen may display: the task board, or the analytics. */
export type GuestViewName = 'DASHBOARD' | 'ANALYTICS';

/**
 * Session policy.
 *
 * `auth.session.timeout` (Settings > Authentication, in minutes) is how long a
 * signed-in user may stay away before having to sign in again. It is the life of
 * the refresh token, which is sliding: every rotation (at least every 15 minutes
 * while the application is in use) starts the period again.
 *
 * Bounds are the ones of the settings screen. A TV (GUEST) screen runs around
 * the clock and nobody is there to sign in again, so it keeps a year, whatever
 * the policy says.
 */
export const SESSION_TIMEOUT_MIN_MINUTES = 5;
export const SESSION_TIMEOUT_MAX_MINUTES = 1440;
export const SESSION_TIMEOUT_DEFAULT_MINUTES = 30;
export const GUEST_REFRESH_TOKEN_DAYS = 365;

/** Reads the stored setting (a string) defensively: anything unusable falls back to the default. */
export function resolveSessionTimeoutMinutes(raw: unknown): number {
  const minutes = Math.trunc(Number(raw));
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return SESSION_TIMEOUT_DEFAULT_MINUTES;
  }
  return Math.min(
    Math.max(minutes, SESSION_TIMEOUT_MIN_MINUTES),
    SESSION_TIMEOUT_MAX_MINUTES,
  );
}

export const refreshTokenLifetimeMs = (
  role: string | undefined,
  timeoutMinutes: number,
): number =>
  role === 'GUEST'
    ? GUEST_REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
    : timeoutMinutes * 60 * 1000;
