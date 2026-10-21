import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { SettingsService } from '../src/settings/settings.service';
import {
  TRUSTED_ORIGIN,
  cookieNamed,
  createE2eApp,
  loginCookies,
} from './helpers/e2e-app';

/** The policy keys the session reads (lowercase role names, as in the settings registry). */
const POLICY_KEYS = [
  'security.enforcement.passkeys.user',
  'security.enforcement.passkeys.manager',
  'security.enforcement.passkeys.admin',
  'auth.requirements.user.passkeys',
  'auth.requirements.admin.passkeys',
];

describe('Passkeys Hard Enforcement (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settingsService: SettingsService;
  let redis: any;
  /** Access cookies (`access_token=…`) of the two users. */
  let accessToken: string;
  let userWithPasskeyToken: string;

  const setSetting = async (key: string, value: boolean) => {
    await prisma.client.config.upsert({
      where: { key },
      update: { value: String(value) },
      create: { key, value: String(value) },
    });
  };
  /** Passkeys on, and required for the USER role. */
  const requirePasskeysForUsers = async () => {
    await setSetting('auth.passkeys.enabled', true);
    await setSetting('security.enforcement.passkeys.user', true);
    (settingsService as any).cache.clear();
    await redis.flushdb();
  };

  beforeAll(async () => {
    app = await createE2eApp();

    prisma = app.get(PrismaService);
    settingsService = app.get(SettingsService);
    redis = app.get(REDIS_CLIENT);

    // Ensure users exist
    const hashedPassword = await bcrypt.hash('password123', 10);

    // User without passkey
    await prisma.client.user.upsert({
      where: { username: 'nopasskeyuser' },
      update: { passwordHash: hashedPassword, role: 'USER' },
      create: {
        email: 'nopasskey@local',
        username: 'nopasskeyuser',
        passwordHash: hashedPassword,
        role: 'USER',
        fullname: 'No Passkey User',
      },
    });

    // User with passkey
    const userWPasskey = await prisma.client.user.upsert({
      where: { username: 'haspasskeyuser' },
      update: { passwordHash: hashedPassword, role: 'USER' },
      create: {
        email: 'haspasskey@local',
        username: 'haspasskeyuser',
        passwordHash: hashedPassword,
        role: 'USER',
        fullname: 'Has Passkey User',
      },
    });

    // Add passkey to second user
    await prisma.client.passkey.deleteMany({
      where: { userId: userWPasskey.id },
    });
    await prisma.client.passkey.create({
      data: {
        id: 'mock-cred-id',
        userId: userWPasskey.id,
        publicKey: Buffer.from('mock-pub-key'),
        counter: 0,
        transports: '["internal"]',
        deviceType: 'singleDevice',
        backedUp: false,
        name: 'Mock Passkey',
      },
    });

    // Login user without passkey
    accessToken = cookieNamed(
      await loginCookies(app, 'nopasskeyuser', 'password123'),
      'access_token',
    )!;

    // Login user with passkey
    userWithPasskeyToken = cookieNamed(
      await loginCookies(app, 'haspasskeyuser', 'password123'),
      'access_token',
    )!;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Reset policy to disabled
    await setSetting('auth.passkeys.enabled', false);
    for (const key of POLICY_KEYS) await setSetting(key, false);
    (settingsService as any).cache.clear();
    await redis.flushdb();
  });

  it('allows access to protected routes when policy is disabled (no passkey)', async () => {
    await request(app.getHttpServer())
      .get('/api/dashboard/stats')
      .set('Cookie', accessToken)
      .expect(200);
  });

  it('blocks access to protected routes when policy is REQUIRED and NO passkey (403)', async () => {
    await requirePasskeysForUsers();

    const res = await request(app.getHttpServer())
      .get('/api/dashboard/stats')
      .set('Cookie', accessToken)
      .expect(403);

    expect(res.body.code).toBe('PASSKEY_REQUIRED');
  });

  it('allows access to protected routes when policy is REQUIRED and HAS passkey (200)', async () => {
    await requirePasskeysForUsers();

    await request(app.getHttpServer())
      .get('/api/dashboard/stats')
      .set('Cookie', userWithPasskeyToken)
      .expect(200);
  });

  it('allows access to whitelisted endpoints (exempt routes) even if policy is REQUIRED and NO passkey', async () => {
    await requirePasskeysForUsers();

    // 1. Session should be allowed
    const sessionRes = await request(app.getHttpServer())
      .get('/api/auth/session')
      .set('Cookie', accessToken)
      .expect(200);

    expect(sessionRes.body.passkeyPolicy).toBe('required');
    expect(sessionRes.body.hasPasskey).toBe(false);

    // 2. Generate Options should be allowed
    await request(app.getHttpServer())
      .get('/api/auth/passkeys/register/options')
      .set('Cookie', accessToken)
      .expect(200);

    // 3. Logout should be allowed
    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Origin', TRUSTED_ORIGIN)
      .set('Cookie', accessToken)
      .expect(200);
  });
});
