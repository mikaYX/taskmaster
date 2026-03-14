import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { CompositeAuthGuard } from '../src/auth/guards/composite-auth.guard';
import { Role } from '../src/enums/role.enum';
import { ExecutionContext } from '@nestjs/common';

describe('TasksController (e2e)', () => {
  let app: INestApplication;

  const mockUserUser = {
    userId: 1,
    username: 'user',
    role: Role.USER,
  };

  const mockJwtAuthGuard = {
    canActivate: (context: ExecutionContext) => {
      const req = context.switchToHttp().getRequest();
      req.user = mockUserUser;
      return true;
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideGuard(CompositeAuthGuard)
      .useValue(mockJwtAuthGuard) // This mock sets user and returns true
      .overrideGuard(JwtAuthGuard) // Just in case used elsewhere
      .useValue(mockJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('/tasks/:id (DELETE) - Fail for USER role', () => {
    return request(app.getHttpServer())
      .delete('/tasks/999') // ID doesn't matter, guard should block first
      .expect(403);
  });

  describe('Occurrence Overrides', () => {
    it('/tasks/:id/occurrences/override (POST) - Require targetDate for MOVE action', () => {
      return request(app.getHttpServer())
        .post('/tasks/1/occurrences/override')
        .send({
          originalDate: '2024-01-01',
          action: 'MOVE',
          // missing targetDate
        })
        .expect(400);
    });

    it('/tasks/:id/occurrences/override (POST) - Forbid targetDate for SKIP action', () => {
      return request(app.getHttpServer())
        .post('/tasks/1/occurrences/override')
        .send({
          originalDate: '2024-01-01',
          action: 'SKIP',
          targetDate: '2024-01-02',
        })
        .expect(400);
    });

    it('/tasks/:id/occurrences/override (POST) - Invalid date format', () => {
      return request(app.getHttpServer())
        .post('/tasks/1/occurrences/override')
        .send({
          originalDate: '2024/01/01', // Should be YYYY-MM-DD
          action: 'SKIP',
        })
        .expect(400);
    });
  });
});
