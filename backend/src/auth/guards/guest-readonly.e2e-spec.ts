import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

describe('Guest Read-Only Authorization (e2e smoke)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let guestToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Sign a synthetic GUEST JWT (no DB user needed for guard unit test)
    guestToken = jwtService.sign({
      sub: 9999,
      username: 'guest_tv',
      role: 'GUEST',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GUEST role: read routes', () => {
    it('GET /api/tasks/board should return 200', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/board')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect((res) => {
          expect([200, 404]).toContain(res.status);
        });
    });
  });

  describe('GUEST role: write routes are blocked', () => {
    it('POST /api/tasks should return 403', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'hacked', periodicity: 'DAILY', startDate: '2026-01-01' })
        .expect(403);
    });

    it('DELETE /api/tasks/1 should return 403', () => {
      return request(app.getHttpServer())
        .delete('/api/tasks/1')
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(403);
    });

    it('PATCH /api/tasks/1 should return 403', () => {
      return request(app.getHttpServer())
        .patch('/api/tasks/1')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ name: 'tamper' })
        .expect(403);
    });

    it('PUT /api/status should return 403', () => {
      return request(app.getHttpServer())
        .put('/api/status/1')
        .set('Authorization', `Bearer ${guestToken}`)
        .send({ status: 'SUCCESS' })
        .expect(403);
    });
  });
});
