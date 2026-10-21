/**
 * Deterministic stand-in for otplib v13 (TOTP class + plugins), the API used by
 * MfaService. Every code verifies, so auth flows never depend on the clock.
 */
export class NobleCryptoPlugin {}

export class ScureBase32Plugin {}

export class TOTP {
  generateSecret = jest.fn(() => 'MOCK_SECRET');
  toURI = jest.fn(() => 'otpauth://totp/Mock');
  verify = jest.fn(async () => ({ valid: true, delta: 0 }));
}
