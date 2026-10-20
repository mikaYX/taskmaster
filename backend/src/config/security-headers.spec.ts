import { buildHelmetOptions } from './security-headers';

describe('buildHelmetOptions', () => {
  it('keeps the defaults (HTTPS upgrade, HSTS) when the public URL is HTTPS', () => {
    expect(
      buildHelmetOptions('production', ['https://taskmaster.example.com']),
    ).toEqual({});
  });

  it('drops the HTTPS upgrade and HSTS when the application is served over HTTP', () => {
    const options = buildHelmetOptions('production', [
      'http://10.1.1.167:3000',
      'http://10.1.1.167:3000',
    ]);

    const csp = options.contentSecurityPolicy as {
      directives: Record<string, unknown>;
    };
    expect(csp.directives['upgrade-insecure-requests']).toBeNull();
    expect(csp.directives['script-src']).toEqual(["'self'"]);
    expect(options.strictTransportSecurity).toBe(false);
  });

  it('does not weaken the rest of the policy', () => {
    const csp = buildHelmetOptions('production', ['http://srv:3000'])
      .contentSecurityPolicy as { directives: Record<string, unknown> };

    expect(csp.directives['default-src']).toEqual(["'self'"]);
    expect(csp.directives['object-src']).toEqual(["'none'"]);
  });

  it('disables the policy outside production, as before', () => {
    expect(buildHelmetOptions('development', [])).toEqual({
      contentSecurityPolicy: false,
    });
  });
});
