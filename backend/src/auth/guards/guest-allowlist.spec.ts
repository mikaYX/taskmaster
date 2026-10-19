import 'reflect-metadata';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { assertGuestAllowed, isGuestAllowed } from './guest-allowlist';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CompositeAuthGuard } from './composite-auth.guard';

jest.mock('@nestjs/passport', () => ({
  ...jest.requireActual('@nestjs/passport'),
  AuthGuard: jest.fn().mockImplementation(
    () =>
      class MockAuthGuard {
        async canActivate() {
          return true;
        }
      },
  ),
}));

const REQUEST_METHODS = [
  'GET',
  'POST',
  'PUT',
  'DELETE',
  'PATCH',
  'ALL',
  'OPTIONS',
  'HEAD',
];

/** Every `@Get()/@Post()...` of every controller, read from Nest's own metadata. */
function collectRoutes(): { method: string; path: string; where: string }[] {
  const srcRoot = join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.controller\.ts$/.test(entry)) files.push(full);
    }
  };
  walk(srcRoot);

  const routes: { method: string; path: string; where: string }[] = [];
  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      const base = Reflect.getMetadata(PATH_METADATA, exported);
      if (base === undefined) continue; // not a controller
      const basePath = Array.isArray(base) ? base[0] : base;
      for (const name of Object.getOwnPropertyNames(exported.prototype)) {
        const handler = exported.prototype[name];
        const verb = Reflect.getMetadata(METHOD_METADATA, handler);
        if (verb === undefined) continue;
        const sub = Reflect.getMetadata(PATH_METADATA, handler);
        const subPath = Array.isArray(sub) ? sub[0] : sub;
        routes.push({
          method: REQUEST_METHODS[verb] ?? String(verb),
          path: `/${basePath}/${subPath ?? ''}`
            .replace(/\/+/g, '/')
            .replace(/(.)\/$/, '$1'),
          where: `${exported.name}.${name}`,
        });
      }
    }
  }
  return routes;
}

describe('Guest (TV) allowlist', () => {
  it.each([
    ['GET', '/api/auth/session'],
    ['POST', '/api/auth/logout'],
    ['GET', '/api/tasks/board'],
    ['GET', '/api/sites'],
    ['get', '/tasks/board/'], // prefix and trailing slash are not significant
  ])('lets a guest call %s %s', (method, path) => {
    expect(isGuestAllowed(method, path)).toBe(true);
  });

  it.each([
    // data a wall screen must never expose
    ['GET', '/api/users'],
    ['GET', '/api/users/:id'],
    ['GET', '/api/groups/:id/members'],
    ['GET', '/api/analytics/export/csv'],
    ['GET', '/api/analytics/export/pdf'],
    ['GET', '/api/todos'],
    ['GET', '/api/dashboard/stats'],
    ['GET', '/api/tasks/:id'],
    ['GET', '/api/tasks/:id/procedure'],
    ['GET', '/api/status'],
    ['GET', '/api/sites/:id'],
    ['GET', '/api/settings'],
    ['GET', '/api/auth/passkeys'],
    // writes and account changes that some controllers never protected with RolesGuard
    ['POST', '/api/auth/password'],
    ['POST', '/api/push/subscribe'],
    ['POST', '/api/mfa/setup'],
    // right path, wrong verb
    ['POST', '/api/tasks/board'],
    ['DELETE', '/api/sites'],
    ['GET', '/api/auth/logout'],
    ['HEAD', '/api/tasks/board'],
  ])('refuses a guest on %s %s', (method, path) => {
    expect(isGuestAllowed(method, path)).toBe(false);
  });

  it('matches the route pattern only, so spelling tricks do not help', () => {
    expect(isGuestAllowed('GET', '/api/Tasks/board')).toBe(false);
    expect(isGuestAllowed('GET', '/api//tasks/board')).toBe(false);
    expect(isGuestAllowed('GET', '/api/tasks/board/../users')).toBe(false);
    expect(isGuestAllowed('GET', '/api/tasks/board.json')).toBe(false);
  });

  describe('assertGuestAllowed', () => {
    it('never restricts other roles', () => {
      for (const role of ['SUPER_ADMIN', 'MANAGER', 'USER', 'API_KEY']) {
        expect(() =>
          assertGuestAllowed({
            user: { role },
            method: 'DELETE',
            route: { path: '/api/users/:id' },
          }),
        ).not.toThrow();
      }
    });

    it('refuses a guest without a matched route (fail closed)', () => {
      expect(() =>
        assertGuestAllowed({ user: { role: 'GUEST' }, method: 'GET' }),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertGuestAllowed({
          user: { role: 'GUEST' },
          method: 'GET',
          route: { path: /tasks/ },
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('against the real controllers', () => {
    const routes = collectRoutes();

    it('finds a meaningful number of routes (the scan itself works)', () => {
      expect(routes.length).toBeGreaterThan(100);
    });

    it('allows exactly the listed routes and nothing else', () => {
      const reachable = routes
        .filter((route) => isGuestAllowed(route.method, route.path))
        .map((route) => `${route.method} ${route.path}`)
        .sort();

      expect(reachable).toEqual([
        'GET /auth/session',
        'GET /sites',
        'GET /tasks/board',
        'POST /auth/logout',
      ]);
    });
  });

  describe('in the authentication guards', () => {
    const context = (user: unknown, method: string, routePath: string) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            user,
            method,
            headers: {},
            route: { path: routePath },
          }),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
      }) as unknown as ExecutionContext;

    const guest = { sub: 9, role: 'GUEST' };
    const jwtGuard = () =>
      new JwtAuthGuard(
        { set: jest.fn() } as never,
        { getAllAndOverride: jest.fn().mockReturnValue(true) } as never,
        { getSession: jest.fn() } as never,
      );
    const compositeGuard = () =>
      new CompositeAuthGuard(
        { set: jest.fn() } as never,
        {
          client: {
            userSiteAssignment: { findMany: jest.fn().mockResolvedValue([]) },
          },
        } as never,
      );

    it.each([
      ['JwtAuthGuard', jwtGuard],
      ['CompositeAuthGuard', compositeGuard],
    ])('%s lets a guest reach the board', async (_name, build) => {
      await expect(
        build().canActivate(context(guest, 'GET', '/api/tasks/board')),
      ).resolves.toBe(true);
    });

    it.each([
      ['JwtAuthGuard', jwtGuard, 'GET', '/api/users'],
      ['JwtAuthGuard', jwtGuard, 'POST', '/api/push/subscribe'],
      ['CompositeAuthGuard', compositeGuard, 'GET', '/api/tasks/:id/procedure'],
      ['CompositeAuthGuard', compositeGuard, 'GET', '/api/schedules'],
    ])('%s refuses a guest on %s %s', async (_name, build, method, path) => {
      await expect(
        build().canActivate(context(guest, method, path)),
      ).rejects.toThrow(ForbiddenException);
    });

    it('does not affect a regular user on the same routes', async () => {
      const manager = { sub: 2, role: 'MANAGER' };

      await expect(
        jwtGuard().canActivate(context(manager, 'GET', '/api/users')),
      ).resolves.toBe(true);
      await expect(
        compositeGuard().canActivate(
          context(manager, 'GET', '/api/tasks/:id/procedure'),
        ),
      ).resolves.toBe(true);
    });
  });

  describe('one screen per TV link', () => {
    const ANALYTICS = 'ANALYTICS' as const;
    const DASHBOARD = 'DASHBOARD' as const;

    it.each([
      ['GET', '/api/analytics/overview'],
      ['GET', '/api/analytics/trend'],
      ['GET', '/api/analytics/by-task'],
      ['GET', '/api/auth/session'],
      ['POST', '/api/auth/logout'],
      ['GET', '/api/sites'],
    ])('lets an ANALYTICS screen call %s %s', (method, path) => {
      expect(isGuestAllowed(method, path, ANALYTICS)).toBe(true);
    });

    it.each([
      ['GET', '/api/tasks/board'], // that is the other screen
      ['GET', '/api/analytics/by-user'], // people are never shown on a wall
      ['GET', '/api/analytics/export/csv'],
      ['GET', '/api/analytics/export/pdf'],
      ['GET', '/api/users'],
      ['POST', '/api/analytics/overview'],
    ])('refuses an ANALYTICS screen on %s %s', (method, path) => {
      expect(isGuestAllowed(method, path, ANALYTICS)).toBe(false);
    });

    it.each([
      '/api/analytics/overview',
      '/api/analytics/trend',
      '/api/analytics/by-task',
    ])('keeps the analytics away from a DASHBOARD screen: %s', (path) => {
      expect(isGuestAllowed('GET', path, DASHBOARD)).toBe(false);
      expect(isGuestAllowed('GET', path)).toBe(false); // no view = the board
      expect(isGuestAllowed('GET', path, null)).toBe(false);
    });

    it('treats an unknown view as the board, never as something wider', () => {
      expect(
        isGuestAllowed('GET', '/api/tasks/board', 'WHATEVER' as never),
      ).toBe(true);
      expect(
        isGuestAllowed('GET', '/api/analytics/overview', 'WHATEVER' as never),
      ).toBe(false);
    });

    it('reads the view from the authenticated user in the guards', () => {
      const req = (guestView: string | undefined, path: string) => ({
        user: { role: 'GUEST', guestView: guestView as never },
        method: 'GET',
        route: { path },
      });

      expect(() =>
        assertGuestAllowed(req('ANALYTICS', '/api/analytics/overview')),
      ).not.toThrow();
      expect(() =>
        assertGuestAllowed(req('ANALYTICS', '/api/tasks/board')),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertGuestAllowed(req('DASHBOARD', '/api/analytics/overview')),
      ).toThrow(ForbiddenException);
      expect(() =>
        assertGuestAllowed(req(undefined, '/api/tasks/board')),
      ).not.toThrow();
    });

    it('allows exactly the listed routes of each screen in the real controllers', () => {
      const routes = collectRoutes();
      const reachable = (view: 'DASHBOARD' | 'ANALYTICS') =>
        routes
          .filter((route) => isGuestAllowed(route.method, route.path, view))
          .map((route) => `${route.method} ${route.path}`)
          .sort();

      expect(reachable('ANALYTICS')).toEqual([
        'GET /analytics/by-task',
        'GET /analytics/overview',
        'GET /analytics/trend',
        'GET /auth/session',
        'GET /sites',
        'POST /auth/logout',
      ]);
      expect(reachable('DASHBOARD')).toEqual([
        'GET /auth/session',
        'GET /sites',
        'GET /tasks/board',
        'POST /auth/logout',
      ]);
    });
  });
});
