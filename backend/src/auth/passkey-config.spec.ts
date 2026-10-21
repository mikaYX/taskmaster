import { resolvePasskeyConfig } from './passkey-config';

describe('deployment passkey configuration', () => {
  it('keeps both local development origins', () => {
    expect(resolvePasskeyConfig({})).toEqual({
      rpID: 'localhost',
      expectedOrigin: ['http://localhost:5173', 'http://localhost:3000'],
    });
  });
  it.each(['taskmaster.example.com', 'tasks.example.org'])(
    'derives the RP domain per installation: %s',
    (domain) => {
      expect(
        resolvePasskeyConfig({ FRONTEND_URL: `https://${domain}:8443/` }),
      ).toEqual({ rpID: domain, expectedOrigin: [`https://${domain}:8443`] });
    },
  );
  it('preserves an explicit compatible RP for existing credentials', () => {
    expect(
      resolvePasskeyConfig({
        FRONTEND_URL: 'https://tasks.example.org',
        RP_ID: 'example.org',
      }).rpID,
    ).toBe('example.org');
  });
  it.each([
    { FRONTEND_URL: 'https://tasks.example.org', RP_ID: 'localhost' },
    {
      FRONTEND_URL: 'https://tasks.example.org',
      RP_ID: 'https://tasks.example.org',
    },
    { FRONTEND_URL: 'http://tasks.example.org' },
    { FRONTEND_URL: 'https://127.0.0.1' },
    { FRONTEND_URL: 'invalid' },
    { FRONTEND_URL: 'https://tasks.example.org', RP_ID: 'com' },
    { FRONTEND_URL: 'https://tasks.example.org', RP_ID: 'other.example.org' },
  ])('rejects unsafe or inconsistent configuration %j', (env) => {
    expect(() => resolvePasskeyConfig(env)).toThrow('FRONTEND_URL');
  });
});
