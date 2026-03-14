import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('ApiKeys (E2E)', () => {
  let app: INestApplication;
  let apiKey: string;
  let adminToken: string;

  beforeAll(async () => {
    try {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

      app = moduleFixture.createNestApplication();
      app.useGlobalPipes(
        new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
      );
      await app.init();

      // Seed Admin User
      const prisma = app.get(PrismaService);
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.client.user.upsert({
        where: { username: 'admin' },
        update: { passwordHash: hashedPassword, role: 'SUPER_ADMIN' },
        create: {
          email: 'admin@taskmaster.local',
          username: 'admin',
          passwordHash: hashedPassword,
          role: 'SUPER_ADMIN',
          fullname: 'Admin User',
        },
      });

      // 1. Login as Admin
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'password123' });

      adminToken = loginRes.body.accessToken;

      // 2. Create initial API Key
      const keyRes = await request(app.getHttpServer())
        .post('/auth/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Key',
          description: 'Key for E2E testing',
          scopes: ['task:read']
        });

      apiKey = keyRes.body.apiKey;
    } catch (error) {
      console.error('Error in beforeAll:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await app.close();
  });

  it('should list API keys', async () => {
    const res = await request(app.getHttpServer())
      .get('/auth/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Test Key',
          keyPrefix: expect.any(String),
        }),
      ]),
    );
  });

  it('should return 400 for invalid scopes', async () => {
    return request(app.getHttpServer())
      .post('/auth/api-keys')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Invalid Key',
        scopes: ['INVALID_SCOPE']
      })
      .expect(400);
  });

  it('should allow access to /tasks with valid API Key', () => {
    return request(app.getHttpServer())
      .get('/tasks')
      .set('X-API-KEY', apiKey)
      .expect(200);
  });

  it('should deny access if scope is missing', async () => {
    return request(app.getHttpServer())
      .delete('/tasks/99999')
      .set('X-API-KEY', apiKey)
      .expect(403);
  });

  it('should rotate an API key', async () => {
    // 1. Get key ID
    const listRes = await request(app.getHttpServer())
      .get('/auth/api-keys')
      .set('Authorization', `Bearer ${adminToken}`);
    const keyId = listRes.body[0].id;

    // 2. Rotate
    const rotateRes = await request(app.getHttpServer())
      .post(`/auth/api-keys/${keyId}/rotate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const newApiKey = rotateRes.body.apiKey;
    expect(newApiKey).not.toEqual(apiKey);

    // 3. Old key should fail now (revoked during rotation)
    await request(app.getHttpServer())
      .get('/tasks')
      .set('X-API-KEY', apiKey)
      .expect(401);

    // 4. New key should work
    await request(app.getHttpServer())
      .get('/tasks')
      .set('X-API-KEY', newApiKey)
      .expect(200);

    apiKey = newApiKey; // Update for next tests
  });

  it('should revoke an API key', async () => {
    // 1. Get key ID
    const listRes = await request(app.getHttpServer())
      .get('/auth/api-keys')
      .set('Authorization', `Bearer ${adminToken}`);
    const keyId = listRes.body.find((k: any) => !k.revokedAt).id;

    // 2. Revoke
    await request(app.getHttpServer())
      .delete(`/auth/api-keys/${keyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);

    // 3. Should fail
    await request(app.getHttpServer())
      .get('/tasks')
      .set('X-API-KEY', apiKey)
      .expect(401);
  });
});
