import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { CompositeAuthGuard } from '../src/auth/guards/composite-auth.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { createE2eApp } from './helpers/e2e-app';

describe('Guests Creation and Flow (e2e)', () => {
  let app: INestApplication;
  /** A site of its own, so the suite can run again on the same database. */
  let siteId: number;
  const currentMockUser: any = {
    userId: 1,
    sub: 1,
    username: 'admin',
    role: UserRole.SUPER_ADMIN,
    groupIds: [],
  };

  const mockAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = currentMockUser;
      return true;
    },
  };

  const mockRolesGuard = {
    canActivate: () => true,
  };

  beforeAll(async () => {
    app = await createE2eApp((builder) =>
      builder
        .overrideGuard(CompositeAuthGuard)
        .useValue(mockAuthGuard)
        .overrideGuard(JwtAuthGuard)
        .useValue(mockAuthGuard)
        .overrideGuard(RolesGuard)
        .useValue(mockRolesGuard),
    );

    const prisma = app.get(PrismaService);
    const site = await prisma.client.site.upsert({
      where: { code: 'E2E_GUESTS' },
      update: {},
      create: { code: 'E2E_GUESTS', name: 'E2E guests' },
    });
    siteId = site.id;
    // Guests left by a previous run would make the creation a conflict.
    await prisma.client.user.updateMany({
      where: {
        role: 'GUEST',
        deletedAt: null,
        sites: { some: { siteId } },
      },
      data: { deletedAt: new Date() },
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /users should FAIL when trying to create role GUEST', () => {
    return request(app.getHttpServer())
      .post('/api/users')
      .send({
        username: 'standard_guest_test',
        password: 'Password123!',
        fullname: 'Should Fail',
        email: 'fail@test.com',
        role: 'GUEST',
        siteId: 1,
      })
      .expect(409)
      .expect((res) => {
        // GlobalExceptionFilter returns the message under `error`.
        expect(res.body.error).toContain(
          'Guest users cannot be created via the standard user endpoint',
        );
      });
  });

  it('POST /guests/site/:siteId should SUCCEED for admin', async () => {
    // Without a body, the task-board screen is created (one account per screen).
    const res = await request(app.getHttpServer())
      .post(`/api/guests/site/${siteId}`)
      .expect(201);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].role).toBe('GUEST');
    expect(res.body[0].guestView).toBe('DASHBOARD');
    expect(res.body[0].rawPassword).toBeDefined();
    expect(res.body[0].username).toContain('guest_');

    // Verify "one account per screen and site" constraint
    await request(app.getHttpServer())
      .post(`/api/guests/site/${siteId}`)
      .expect(409)
      .expect((res) => {
        expect(res.body.error).toContain('already exist for site');
      });
  });

  it('GET /guests should list active guests', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/guests')
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((g: any) => g.role === 'GUEST')).toBe(true);
  });

  it('PATCH /guests/:id/regenerate should work', async () => {
    // Find the guest we created
    const list = await request(app.getHttpServer()).get('/api/guests');
    const guestId = list.body[0].id;

    const res = await request(app.getHttpServer())
      .patch(`/api/guests/${guestId}/regenerate`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.newPassword).toBeDefined();
  });

  it('DELETE /guests/:id should revoke access', async () => {
    const list = await request(app.getHttpServer()).get('/api/guests');
    const guestId = list.body[0].id;

    await request(app.getHttpServer())
      .delete(`/api/guests/${guestId}`)
      .expect(200);

    // Verify it no longer appears in active list (findBySite)
    const resCheck = await request(app.getHttpServer())
      .get(`/api/guests/site/${siteId}`)
      .expect(200);

    expect(resCheck.body).toEqual({}); // Or null depending on how supertest handles empty JSON
  });
});
