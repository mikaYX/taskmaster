/**
 * Auth Cookie Contract — E2E test suite
 *
 * Verifies that the HttpOnly cookie contract is enforced end-to-end:
 *  - Login: tokens are only in HttpOnly cookies (no accessToken in body)
 *  - Refresh: reads cookie, rotates it, returns session metadata only
 *  - Logout: clears the cookie
 *  - CSRF guard: blocks requests without trusted Origin/Referer
 *  - Security: refreshToken MUST NOT appear in JSON body
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_USER = {
  username: 'cookie_e2e_user',
  password: 'TestPassword123!',
};

describe('Auth Cookie Contract (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = app.get(PrismaService);

    // Create test user
    const existing = await prisma.client.user.findFirst({
      where: { username: TEST_USER.username },
    });
    if (existing) {
      await prisma.client.user.delete({ where: { id: existing.id } });
    }

    const hash = await bcrypt.hash(TEST_USER.password, 10);
    const user = await prisma.client.user.create({
      data: {
        username: TEST_USER.username,
        passwordHash: hash,
        role: 'USER',
        fullname: 'Cookie E2E Test User',
      },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (prisma && userId) {
      await prisma.client.refreshToken.deleteMany({ where: { userId } });
      await prisma.client.user.delete({ where: { id: userId } });
    }
    if (app) {
      await app.close();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('does not expose tokens in body and sets HttpOnly auth cookies', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      expect(res.body.expiresIn).toBeDefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();

      const setCookies: string[] = res.headers['set-cookie'] ?? [];
      const refreshCookie = setCookies.find((c) => c.startsWith('refresh_token='));
      const accessCookie = setCookies.find((c) => c.startsWith('access_token='));

      expect(refreshCookie).toBeDefined();
      expect(accessCookie).toBeDefined();
      expect(refreshCookie?.toLowerCase()).toContain('httponly');
      expect(refreshCookie?.toLowerCase()).toContain('samesite=strict');
      expect(accessCookie?.toLowerCase()).toContain('httponly');
      expect(accessCookie?.toLowerCase()).toContain('samesite=strict');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/refresh', () => {
    let refreshCookie: string;

    beforeEach(async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      const setCookies: string[] = loginRes.headers['set-cookie'] ?? [];
      refreshCookie =
        setCookies.find((c) => c.startsWith('refresh_token=')) ?? '';
    });

    it('accepts request with valid Origin header and rotates cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(res.body.expiresIn).toBeDefined();
      expect(res.body.accessToken).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();

      const rotatedRefreshCookie =
        (res.headers['set-cookie'] as string[] | undefined)?.find((c) =>
          c.startsWith('refresh_token='),
        ) ?? '';
      expect(rotatedRefreshCookie).toContain('refresh_token=');
      expect(rotatedRefreshCookie).not.toBe(refreshCookie); // Cookie must be rotated
    });

    it('accepts request with valid Referer header (no Origin)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Referer', 'http://localhost:5173/login')
        .set('Cookie', refreshCookie)
        .expect(200);
    });

    it('blocks request with no trusted Origin/Referer (CSRF)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Cookie', refreshCookie)
        .expect(403);
    });

    it('blocks request when only X-Requested-With is provided', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', refreshCookie)
        .expect(403);
    });

    it('blocks request from untrusted Origin', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'https://evil.example.com')
        .set('Cookie', refreshCookie)
        .expect(403);
    });

    it('returns 401 when refresh_token cookie is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/logout', () => {
    it('clears the refresh_token cookie', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      const setCookies: string[] = loginRes.headers['set-cookie'] ?? [];
      const refreshCookie =
        setCookies.find((c) => c.startsWith('refresh_token=')) ?? '';
      const accessCookie =
        setCookies.find((c) => c.startsWith('access_token=')) ?? '';

      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', [accessCookie, refreshCookie])
        .expect(200);

      expect(logoutRes.body.ok).toBe(true);

      const clearedCookie: string = logoutRes.headers['set-cookie']?.[0] ?? '';
      const isCleared =
        clearedCookie.includes('Max-Age=0') ||
        /Expires=Thu,? 01 Jan 1970/i.test(clearedCookie);
      expect(isCleared).toBe(true);
    });

    it('blocks logout without CSRF header', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      const setCookies: string[] = loginRes.headers['set-cookie'] ?? [];
      const refreshCookie =
        setCookies.find((c) => c.startsWith('refresh_token=')) ?? '';
      const accessCookie =
        setCookies.find((c) => c.startsWith('access_token=')) ?? '';

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Cookie', [accessCookie, refreshCookie])
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('Token theft detection', () => {
    it('revokes family when stale token is reused after rotation', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      const setCookies: string[] = loginRes.headers['set-cookie'] ?? [];
      const staleRefreshCookie =
        setCookies.find((c) => c.startsWith('refresh_token=')) ?? '';

      // Rotate once — stale cookie is now invalid
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', staleRefreshCookie)
        .expect(200);

      // Reuse stale cookie — should trigger theft detection (401 or 403)
      const replayRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', staleRefreshCookie);

      expect([401, 403]).toContain(replayRes.status);
    });
  });
});
