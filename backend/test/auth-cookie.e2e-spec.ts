/**
 * Auth Cookie Contract — E2E test suite
 *
 * Verifies that the HttpOnly cookie contract is enforced end-to-end:
 *  - Login: accessToken in body, refreshToken in HttpOnly cookie only
 *  - Refresh: reads cookie, rotates it, returns new accessToken
 *  - Logout: clears the cookie
 *  - CSRF guard: blocks requests without X-Requested-With or valid Origin
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
    await prisma.client.refreshToken.deleteMany({ where: { userId } });
    await prisma.client.user.delete({ where: { id: userId } });
    await app.close();
  });

  // ─────────────────────────────────────────────────────────────────────────

  describe('POST /api/auth/login', () => {
    it('returns accessToken in body and sets HttpOnly refresh_token cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Requested-With', 'XMLHttpRequest')
        .send(TEST_USER)
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(typeof res.body.accessToken).toBe('string');
      expect(res.body.refreshToken).toBeUndefined();

      const setCookie: string = res.headers['set-cookie']?.[0] ?? '';
      expect(setCookie).toContain('refresh_token=');
      expect(setCookie.toLowerCase()).toContain('httponly');
      expect(setCookie.toLowerCase()).toContain('samesite=strict');
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

      refreshCookie = loginRes.headers['set-cookie']?.[0] ?? '';
    });

    it('accepts request with X-Requested-With header and rotates cookie', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', refreshCookie)
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeUndefined();

      const newCookie: string = res.headers['set-cookie']?.[0] ?? '';
      expect(newCookie).toContain('refresh_token=');
      expect(newCookie).not.toBe(refreshCookie); // Cookie must be rotated
    });

    it('accepts request with valid Origin header (no X-Requested-With)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('Origin', 'http://localhost:5173')
        .set('Cookie', refreshCookie)
        .expect(200);
    });

    it('blocks request with no X-Requested-With and no valid Origin (CSRF)', async () => {
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
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
        .set('X-Requested-With', 'XMLHttpRequest')
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

      const refreshCookie = loginRes.headers['set-cookie']?.[0] ?? '';
      const accessToken: string = loginRes.body.accessToken;

      const logoutRes = await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', refreshCookie)
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

      await request(app.getHttpServer())
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
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

      const staleCookie = loginRes.headers['set-cookie']?.[0] ?? '';

      // Rotate once — stale cookie is now invalid
      await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', staleCookie)
        .expect(200);

      // Reuse stale cookie — should trigger theft detection (401 or 403)
      const replayRes = await request(app.getHttpServer())
        .post('/api/auth/refresh')
        .set('X-Requested-With', 'XMLHttpRequest')
        .set('Cookie', staleCookie);

      expect([401, 403]).toContain(replayRes.status);
    });
  });
});
