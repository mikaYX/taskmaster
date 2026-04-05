import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CompositeAuthGuard } from '../src/auth/guards/composite-auth.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { UserRole } from '@prisma/client';
import { ExecutionContext } from '@nestjs/common';

describe('Guests Creation and Flow (e2e)', () => {
  let app: INestApplication;
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
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(CompositeAuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(JwtAuthGuard)
      .useValue(mockAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockRolesGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('POST /users should FAIL when trying to create role GUEST', () => {
    return request(app.getHttpServer())
      .post('/users')
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
        expect(res.body.message).toContain(
          'Guest users cannot be created via the standard user endpoint',
        );
      });
  });

  it('POST /guests/site/:siteId should SUCCEED for admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/guests/site/1')
      .expect(201);

    expect(res.body.role).toBe('GUEST');
    expect(res.body.rawPassword).toBeDefined();
    expect(res.body.username).toContain('guest_');

    // Verify "One guest per site" constraint
    await request(app.getHttpServer())
      .post('/guests/site/1')
      .expect(409)
      .expect((res) => {
        expect(res.body.message).toContain(
          'active guest already exists for site',
        );
      });
  });

  it('GET /guests should list active guests', async () => {
    const res = await request(app.getHttpServer()).get('/guests').expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((g: any) => g.role === 'GUEST')).toBe(true);
  });

  it('PATCH /guests/:id/regenerate should work', async () => {
    // Find the guest we created
    const list = await request(app.getHttpServer()).get('/guests');
    const guestId = list.body[0].id;

    const res = await request(app.getHttpServer())
      .patch(`/guests/${guestId}/regenerate`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.newPassword).toBeDefined();
  });

  it('DELETE /guests/:id should revoke access', async () => {
    const list = await request(app.getHttpServer()).get('/guests');
    const guestId = list.body[0].id;

    await request(app.getHttpServer()).delete(`/guests/${guestId}`).expect(200);

    // Verify it no longer appears in active list (findBySite)
    const resCheck = await request(app.getHttpServer())
      .get('/guests/site/1')
      .expect(200);

    expect(resCheck.body).toEqual({}); // Or null depending on how supertest handles empty JSON
  });
});
