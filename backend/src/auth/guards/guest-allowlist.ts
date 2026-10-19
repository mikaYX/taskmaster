import { ForbiddenException } from '@nestjs/common';
import type { GuestViewName } from '../auth.constants';

/**
 * A Guest ("TV") account displays one screen, 24/7, on a wall: the task board
 * or the analytics, depending on the link it was created with. Rather than
 * hoping every controller remembers to exclude GUEST, the authentication guards
 * refuse anything not listed here (deny by default).
 *
 * Entries are the route patterns Express matched (e.g. `/tasks/board`), not
 * the raw URL, so casing, `//` or `..` tricks in the request cannot reach a
 * route that is not listed.
 */
interface GuestRoute {
  method: string;
  path: string;
}

/** What every TV screen needs: who am I / keep the session, sign out, its site. */
const COMMON_ROUTES: ReadonlyArray<GuestRoute> = [
  { method: 'GET', path: '/auth/session' },
  { method: 'POST', path: '/auth/logout' },
  // The controller already limits it to the account's own sites.
  { method: 'GET', path: '/sites' },
];

/**
 * What each screen reads. No exports, no per-user figures: a wall screen shows
 * the site's figures, never people.
 */
const VIEW_ROUTES: Record<GuestViewName, ReadonlyArray<GuestRoute>> = {
  DASHBOARD: [{ method: 'GET', path: '/tasks/board' }],
  ANALYTICS: [
    { method: 'GET', path: '/analytics/overview' },
    { method: 'GET', path: '/analytics/trend' },
    { method: 'GET', path: '/analytics/by-task' },
  ],
};

/** `/api/tasks/board/` -> `/tasks/board` (the global prefix and a trailing slash are not significant). */
const normalizeRoutePath = (path: string): string => {
  const withoutPrefix = path.replace(/^\/api(?=\/|$)/, '');
  return withoutPrefix.length > 1
    ? withoutPrefix.replace(/\/+$/, '')
    : withoutPrefix || '/';
};

/** An account created before views existed, or with an unknown value, shows the board. */
const viewOf = (view: unknown): GuestViewName =>
  view === 'ANALYTICS' ? 'ANALYTICS' : 'DASHBOARD';

export function isGuestAllowed(
  method: string,
  routePath: string,
  view?: GuestViewName | null,
): boolean {
  const wanted = normalizeRoutePath(routePath);
  const verb = method.toUpperCase();
  return [...COMMON_ROUTES, ...VIEW_ROUTES[viewOf(view)]].some(
    (route) => route.method === verb && route.path === wanted,
  );
}

interface GuestCheckRequest {
  user?: { role?: string; guestView?: GuestViewName | null };
  method?: string;
  route?: { path?: unknown };
}

/** Throws 403 when the authenticated user is a Guest calling anything but its own screen. */
export function assertGuestAllowed(req: GuestCheckRequest): void {
  if (req.user?.role !== 'GUEST') return;

  const routePath = req.route?.path;
  if (
    typeof routePath !== 'string' ||
    !isGuestAllowed(req.method ?? '', routePath, req.user.guestView)
  ) {
    throw new ForbiddenException(
      'This TV account can only display its own screen.',
    );
  }
}
