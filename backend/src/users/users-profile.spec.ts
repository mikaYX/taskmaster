import { SettingsService } from '../settings/settings.service';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersMeController } from './users-me.controller';
import { UsersService } from './users.service';
import { JwtAuthGuard, AuthService } from '../auth';
import { PrismaService } from '../prisma';
import { AuditService } from '../audit/audit.service';
import { GlobalValidationPipe } from '../common';

describe('self-service profile HTTP access and validation', () => {
  let app: INestApplication;
  const user = {
    id: 7,
    username: 'alice',
    fullname: 'Alice',
    email: null,
    role: 'USER',
    avatarUrl: null,
    mfaEnabled: true,
  };
  const db = { findFirst: jest.fn(), update: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersMeController],
      providers: [
        UsersService,
        {
          provide: SettingsService,
          useValue: { getRawValue: jest.fn().mockResolvedValue('true') },
        },
        { provide: PrismaService, useValue: { client: { user: db } } },
        { provide: AuthService, useValue: {} },
        { provide: AuditService, useValue: {} },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context) => {
          const req = context.switchToHttp().getRequest();
          req.user = { sub: 7, role: req.headers['x-test-role'] || 'USER' };
          return true;
        },
      })
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new GlobalValidationPipe());
    await app.init();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    db.findFirst.mockResolvedValue(user);
    db.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...user, ...data }),
    );
  });
  afterAll(() => app.close());

  it('reads only the authenticated account and selects no authentication secrets', async () => {
    const response = await request(app.getHttpServer())
      .get('/users/me/profile?id=99')
      .expect(200);
    expect(response.body.mfaEnabled).toBe(true);
    expect(db.findFirst).toHaveBeenCalledWith({
      where: { id: 7, deletedAt: null },
      select: {
        id: true,
        username: true,
        fullname: true,
        email: true,
        role: true,
        avatarUrl: true,
        mfaEnabled: true,
      },
    });
  });
  it('saves only the current account display name and trims it', async () => {
    const result = await request(app.getHttpServer())
      .patch('/users/me/profile')
      .send({ fullname: '  Alice Smith  ' })
      .expect(200);
    expect(result.body.fullname).toBe('Alice Smith');
    expect(db.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, deletedAt: null },
        data: { fullname: 'Alice Smith' },
      }),
    );
  });
  it('cannot change role, account id or MFA status through self-service', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .send({
        fullname: 'Alice',
        id: 99,
        role: 'SUPER_ADMIN',
        mfaEnabled: false,
      })
      .expect(400);
    expect(db.update).not.toHaveBeenCalled();
  });
  it('rejects invalid names and denies guest writes', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .send({ fullname: 'x'.repeat(256) })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .send({ fullname: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/users/me/profile')
      .set('x-test-role', 'GUEST')
      .send({ fullname: 'Changed' })
      .expect(403);
    expect(db.update).not.toHaveBeenCalled();
  });
});
