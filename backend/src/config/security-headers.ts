import helmet from 'helmet';
import type { HelmetOptions } from 'helmet';

/**
 * Helmet options for the way the application is reached.
 *
 * Helmet's default policy contains `upgrade-insecure-requests` and HSTS. Over
 * plain HTTP on an address other than localhost (http://10.1.1.167:3000, the
 * usual intranet install) the browser then rewrites every script and style URL
 * to https://, nothing answers there and the page stays white; HSTS also
 * pins the host to HTTPS for a year. Both are kept when the public URL is
 * HTTPS and dropped when it is HTTP.
 */
export function buildHelmetOptions(
  nodeEnv: string,
  publicUrls: Array<string | undefined>,
): HelmetOptions {
  if (nodeEnv !== 'production') {
    return { contentSecurityPolicy: false }; // Disable CSP in dev
  }

  const servedOverHttp = publicUrls.some((url) =>
    /^http:\/\//i.test((url ?? '').trim()),
  );
  if (!servedOverHttp) {
    return {};
  }

  return {
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'upgrade-insecure-requests': null,
      },
    },
    strictTransportSecurity: false,
  };
}
