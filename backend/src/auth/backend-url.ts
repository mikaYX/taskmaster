/**
 * Public address of an API route, as the identity providers must call it.
 *
 * Every route is served under the global `/api` prefix, so a callback
 * registered without it would reach the web app instead of the API.
 * `BACKEND_URL` is the site address (`https://taskmaster.example.com`); a
 * trailing slash or an `/api` suffix is tolerated.
 */
export function backendApiUrl(path: string): string {
  const base = (process.env.BACKEND_URL || 'http://localhost:3000')
    .replace(/\/+$/, '')
    .replace(/\/api$/, '');
  return `${base}/api${path.startsWith('/') ? path : `/${path}`}`;
}
