import { readFileSync } from 'fs';

export interface TlsOptions {
  cert: Buffer;
  key: Buffer;
}

/**
 * Native HTTPS: when both TLS_CERT_FILE and TLS_KEY_FILE are set the server
 * answers in HTTPS itself (a self-signed pair is enough, the browser then shows
 * a certificate warning). With neither set it stays in plain HTTP.
 */
export function loadTlsOptions(
  env: Record<string, string | undefined>,
): TlsOptions | undefined {
  const certFile = env.TLS_CERT_FILE?.trim();
  const keyFile = env.TLS_KEY_FILE?.trim();
  if (!certFile && !keyFile) return undefined;
  if (!certFile || !keyFile) {
    throw new Error('TLS_CERT_FILE and TLS_KEY_FILE must be set together');
  }
  try {
    return { cert: readFileSync(certFile), key: readFileSync(keyFile) };
  } catch (err) {
    throw new Error(
      `Cannot read the TLS certificate or key: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
