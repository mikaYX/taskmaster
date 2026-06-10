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
