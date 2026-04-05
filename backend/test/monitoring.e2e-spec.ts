import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { MetricsModule } from '../src/metrics/metrics.module';
import { HealthModule } from '../src/health/health.module';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../src/prisma/prisma.module';
import { RedisModule } from '../src/common/redis/redis.module';
import { ClsModule } from 'nestjs-cls';

// Désactivation expresse des services d'arrière-plan pour isoler la sonde HealthCheck :
jest.mock('../src/scheduler/scheduler.service', () => ({
  SchedulerService: class {
    onApplicationBootstrap() {}
  },
}));

describe('Monitoring (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        ClsModule.forRoot({ global: true }),
        PrismaModule,
        RedisModule,
        MetricsModule,
        HealthModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Reproduce the critical config from main.ts to simulate production behavior
    const expressApp = app.getHttpAdapter().getInstance();
    expressApp.set('trust proxy', 'loopback');
    app.setGlobalPrefix('api');

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Prometheus /api/metrics', () => {
    it('should ALLOW access from direct loopback (supertest default)', () => {
      return request(app.getHttpServer()).get('/api/metrics').expect(200);
    });

    it('should REJECT an external IP coming through our trusted loopback proxy', () => {
      // Because trust proxy=loopback, Express pulls the X-Forwarded-For IP string
      // and overwrites `request.ip`. The Guard then correctly rejects the external IP.
      return request(app.getHttpServer())
        .get('/api/metrics')
        .set('X-Forwarded-For', '198.51.100.1')
        .expect(403);
    });

    it('should ALLOW a nested loopback IP coming through our trusted proxy', () => {
      return request(app.getHttpServer())
        .get('/api/metrics')
        .set('X-Forwarded-For', '127.0.0.1')
        .expect(200);
    });

    it('should REJECT the WillSoto default /metrics (proving no duplicate unprotected route)', () => {
      // The module Prometheus should no longer expose its internal duplicate
      // because we re-routed the Controller natively in its Module registration.
      return request(app.getHttpServer()).get('/metrics').expect(404);
    });
  });

  describe('Terminus /api/health', () => {
    it('should ALLOW access from direct loopback', () => {
      // Le composant Health peut répondre 503 temporairement si Prisma/Redis sont absents
      // L'essentiel pour notre test est de prouver que la route franchit le M1 LocalNetworkGuard (pas de 403)
      return request(app.getHttpServer())
        .get('/api/health')
        .expect((res) => {
          if (res.status === 403)
            throw new Error('Expected NOT 403 (Guard bypassed incorrectly)');
        });
    });

    it('should REJECT external clients spoofing external IPs', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .set('X-Forwarded-For', '8.8.8.8')
        .expect(403);
    });
  });
});
