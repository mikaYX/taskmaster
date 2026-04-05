import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { SettingsService } from '../src/settings/settings.service';
import { AppModule } from '../src/app.module';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';

describe('Passkeys Hard Enforcement (E2E)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let settingsService: SettingsService;
  let redis: any;
  let accessToken: string;
  let userWithPasskeyToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();

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
    const res1 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'nopasskeyuser', password: 'password123' })
      .expect(200);
    accessToken = res1.body.accessToken;

    // Login user with passkey
    const res2 = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'haspasskeyuser', password: 'password123' })
      .expect(200);
    userWithPasskeyToken = res2.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Reset policy to disabled
    await prisma.client.config.upsert({
      where: { key: 'auth.passkeys.enabled' },
      update: { value: 'false' },
      create: { key: 'auth.passkeys.enabled', value: 'false' },
    });
    const roles = ['USER', 'ADMIN', 'MANAGER'];
    for (const role of roles) {
      await prisma.client.config.upsert({
        where: { key: `security.enforcement.passkeys.${role}` },
        update: { value: 'false' },
        create: {
          key: `security.enforcement.passkeys.${role}`,
          value: 'false',
        },
      });
      await prisma.client.config.upsert({
        where: { key: `auth.requirements.${role}.passkeys` },
        update: { value: 'false' },
        create: { key: `auth.requirements.${role}.passkeys`, value: 'false' },
      });
    }
    (settingsService as any).cache.clear();
    await redis.flushdb();
  });

  it('allows access to protected routes when policy is disabled (no passkey)', async () => {
    await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('blocks access to protected routes when policy is REQUIRED and NO passkey (403)', async () => {
    // Enable passkeys
    await prisma.client.config.update({
      where: { key: 'auth.passkeys.enabled' },
      data: { value: 'true' },
    });
    // Set policy to required for USER
    await prisma.client.config.update({
      where: { key: 'security.enforcement.passkeys.USER' },
      data: { value: 'true' },
    });
    (settingsService as any).cache.clear();
    await redis.flushdb();

    const res = await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    expect(res.body.code).toBe('PASSKEY_REQUIRED');
  });

  it('allows access to protected routes when policy is REQUIRED and HAS passkey (200)', async () => {
    // Enable passkeys
    await prisma.client.config.update({
      where: { key: 'auth.passkeys.enabled' },
      data: { value: 'true' },
    });
    // Set policy to required for USER
    await prisma.client.config.update({
      where: { key: 'security.enforcement.passkeys.USER' },
      data: { value: 'true' },
    });
    (settingsService as any).cache.clear();
    await redis.flushdb();

    await request(app.getHttpServer())
      .get('/dashboard/stats')
      .set('Authorization', `Bearer ${userWithPasskeyToken}`)
      .expect(200);
  });

  it('allows access to whitelisted endpoints (exempt routes) even if policy is REQUIRED and NO passkey', async () => {
    // Enable passkeys globally and require for USER
    await prisma.client.config.upsert({
      where: { key: 'auth.passkeys.enabled' },
      update: { value: 'true' },
      create: { key: 'auth.passkeys.enabled', value: 'true' },
    });
    await prisma.client.config.upsert({
      where: { key: 'security.enforcement.passkeys.user' },
      update: { value: 'true' },
      create: { key: 'security.enforcement.passkeys.user', value: 'true' },
    });
    (settingsService as any).cache.clear();
    await redis.flushdb();

    // 1. Session should be allowed
    const sessionRes = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(sessionRes.body.passkeyPolicy).toBe('required');
    expect(sessionRes.body.hasPasskey).toBe(false);

    // 2. Generate Options should be allowed
    await request(app.getHttpServer())
      .get('/auth/passkeys/register/options')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // 3. Logout should be allowed
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });
});
