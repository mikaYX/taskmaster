import { BadRequestException } from '@nestjs/common';
import { isIP } from 'node:net';

/** Only deployment configuration establishes trust; request headers never do. */
export function resolvePasskeyConfig(env: NodeJS.ProcessEnv = process.env) {
  const fail = (): never => {
    throw new BadRequestException(
      'Passkey configuration invalid: set FRONTEND_URL to the public HTTPS URL used in the browser, and RP_ID (if set) to its domain or a parent domain, without protocol or port. Restart the service.',
    );
  };
  let url: URL;
  try {
    url = new URL(env.FRONTEND_URL || 'http://localhost:5173');
  } catch {
    return fail();
  }
  const rpID = (env.RP_ID || url.hostname).toLowerCase();
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && url.hostname === 'localhost')) ||
    isIP(url.hostname) ||
    isIP(rpID) ||
    !/^(localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)$/.test(rpID) ||
    rpID.includes('..') ||
    (rpID !== 'localhost' && !rpID.includes('.')) ||
    !(url.hostname === rpID || url.hostname.endsWith(`.${rpID}`))
  )
    return fail();
  return {
    rpID,
    expectedOrigin: env.FRONTEND_URL
      ? [url.origin]
      : ['http://localhost:5173', 'http://localhost:3000'],
  };
}
