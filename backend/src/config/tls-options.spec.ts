import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadTlsOptions } from './tls-options';

describe('loadTlsOptions', () => {
  it('stays in HTTP when nothing is configured', () => {
    expect(loadTlsOptions({})).toBeUndefined();
  });

  it('refuses a certificate without its key', () => {
    expect(() => loadTlsOptions({ TLS_CERT_FILE: 'a.pem' })).toThrow(
      /must be set together/,
    );
  });

  it('reads the certificate and the key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tls-'));
    writeFileSync(join(dir, 'c.pem'), 'CERT');
    writeFileSync(join(dir, 'k.pem'), 'KEY');
    const options = loadTlsOptions({
      TLS_CERT_FILE: join(dir, 'c.pem'),
      TLS_KEY_FILE: join(dir, 'k.pem'),
    });
    expect(options?.cert.toString()).toBe('CERT');
    expect(options?.key.toString()).toBe('KEY');
  });

  it('explains an unreadable file', () => {
    expect(() =>
      loadTlsOptions({ TLS_CERT_FILE: 'nope.pem', TLS_KEY_FILE: 'nope.key' }),
    ).toThrow(/Cannot read the TLS certificate/);
  });
});
