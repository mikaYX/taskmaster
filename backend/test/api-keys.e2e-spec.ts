import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { cookieNamed, createE2eApp, loginCookies } from './helpers/e2e-app';

/** API keys are tenant-scoped: every call names its site (created in beforeAll). */
let SITE_ID: string;

describe('ApiKeys (E2E)', () => {
  let app: INestApplication;
  let apiKey: string;
  /** Admin access cookie (`access_token=…`). */
  let adminToken: string;

  beforeAll(async () => {
    try {
      app = await createE2eApp();

      // Seed Admin User
      const prisma = app.get(PrismaService);
      const site = await prisma.client.site.upsert({
        where: { code: 'E2E_KEYS' },
        update: {},
        create: { code: 'E2E_KEYS', name: 'E2E API keys' },
      });
      SITE_ID = String(site.id);
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
      adminToken = cookieNamed(
        await loginCookies(app, 'admin', 'password123'),
        'access_token',
      )!;

      // 2. Create initial API Key
      const keyRes = await request(app.getHttpServer())
        .post('/api/auth/api-keys')
        .set('Cookie', adminToken)
        .send({
          name: 'Test Key',
          description: 'Key for E2E testing',
          scopes: ['task:read'],
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
      .get('/api/auth/api-keys')
      .set('Cookie', adminToken)
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
      .post('/api/auth/api-keys')
      .set('Cookie', adminToken)
      .send({
        name: 'Invalid Key',
        scopes: ['INVALID_SCOPE'],
      })
      .expect(400);
  });

  it('should allow access to /tasks with valid API Key', () => {
    return request(app.getHttpServer())
      .get('/api/tasks')
      .set('X-API-KEY', apiKey)
      .set('X-Site-Id', SITE_ID)
      .expect(200);
  });

  it('should deny access if scope is missing', async () => {
    return request(app.getHttpServer())
      .delete('/api/tasks/99999')
      .set('X-API-KEY', apiKey)
      .set('X-Site-Id', SITE_ID)
      .expect(403);
  });

  it('should rotate an API key', async () => {
    // 1. Get key ID
    const listRes = await request(app.getHttpServer())
      .get('/api/auth/api-keys')
      .set('Cookie', adminToken);
    const keyId = listRes.body[0].id;

    // 2. Rotate
    const rotateRes = await request(app.getHttpServer())
      .post(`/api/auth/api-keys/${keyId}/rotate`)
      .set('Cookie', adminToken)
      .expect(200);

    const newApiKey = rotateRes.body.apiKey;
    expect(newApiKey).not.toEqual(apiKey);

    // 3. Old key should fail now (revoked during rotation)
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('X-API-KEY', apiKey)
      .set('X-Site-Id', SITE_ID)
      .expect(401);

    // 4. New key should work
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('X-API-KEY', newApiKey)
      .set('X-Site-Id', SITE_ID)
      .expect(200);

    apiKey = newApiKey; // Update for next tests
  });

  it('should revoke an API key', async () => {
    // 1. Get key ID
    const listRes = await request(app.getHttpServer())
      .get('/api/auth/api-keys')
      .set('Cookie', adminToken);
    const keyId = listRes.body.find((k: any) => !k.revokedAt).id;

    // 2. Revoke
    await request(app.getHttpServer())
      .delete(`/api/auth/api-keys/${keyId}`)
      .set('Cookie', adminToken)
      .expect(204);

    // 3. Should fail
    await request(app.getHttpServer())
      .get('/api/tasks')
      .set('X-API-KEY', apiKey)
      .set('X-Site-Id', SITE_ID)
      .expect(401);
  });

  describe('writes with a key that holds the task scopes', () => {
    let writeKey: string;
    let prisma: PrismaService;

    beforeAll(async () => {
      prisma = app.get(PrismaService);
      const res = await request(app.getHttpServer())
        .post('/api/auth/api-keys')
        .set('Cookie', adminToken)
        .send({
          name: 'Write Key',
          scopes: ['task:read', 'task:create', 'task:update', 'task:delete'],
        })
        .expect(201);
      writeKey = res.body.apiKey;
    });

    const withKey = (req: request.Test) =>
      req.set('X-API-KEY', writeKey).set('X-Site-Id', SITE_ID);

    it('creates, updates and soft-deletes a task, each action audited', async () => {
      const created = await withKey(
        request(app.getHttpServer()).post('/api/tasks'),
      )
        .send({
          name: 'Created by an API key',
          description: 'Created in e2e',
          periodicity: 'DAILY',
          // A daily task cannot start in the past.
          startDate: new Date(Date.now() + 86_400_000)
            .toISOString()
            .slice(0, 10),
          rrule: 'FREQ=DAILY',
          timezone: 'UTC',
        })
        .expect(201);
      const taskId = created.body.id;
      expect(created.body.siteId ?? Number(SITE_ID)).toBe(Number(SITE_ID));

      await withKey(request(app.getHttpServer()).put(`/api/tasks/${taskId}`))
        .send({ name: 'Renamed by an API key' })
        .expect(200);

      await withKey(
        request(app.getHttpServer()).delete(`/api/tasks/${taskId}`),
      ).expect(200);

      const task = await prisma.client.task.findUnique({
        where: { id: taskId },
      });
      expect(task?.deletedAt).not.toBeNull();
      // No user did it: the deleting user stays empty rather than a fake id.
      expect(task?.deletedBy).toBeNull();

      // Every write is traced, under the key's name (no user id). The audit
      // row is written after the response is sent, so wait for the three.
      const findAudit = () =>
        prisma.client.auditLog.findMany({
          where: {
            OR: [
              { target: `Task:${taskId}` },
              { target: { contains: `/tasks/${taskId}` } },
              { target: { endsWith: '/tasks' } },
            ],
            actorName: { startsWith: 'API Key (' },
          },
        });
      let audit = await findAudit();
      for (let attempt = 0; audit.length < 3 && attempt < 40; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        audit = await findAudit();
      }
      expect(audit.length).toBeGreaterThanOrEqual(3);
      expect(audit.every((entry) => entry.actorId === null)).toBe(true);
    });
  });
});
