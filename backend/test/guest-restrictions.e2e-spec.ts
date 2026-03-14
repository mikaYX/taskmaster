import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { CompositeAuthGuard } from '../src/auth/guards/composite-auth.guard';
import { Role } from '../src/enums/role.enum';
import { ExecutionContext } from '@nestjs/common';

describe('Guest Restrictions (e2e)', () => {
    let app: INestApplication;
    let currentMockUser: any = {
        userId: 1,
        sub: 1,
        username: 'guest',
        role: Role.GUEST,
        groupIds: [],
    };

    const mockCompositeAuthGuard = {
        canActivate: (context: ExecutionContext) => {
            const req = context.switchToHttp().getRequest();
            req.user = currentMockUser;
            return true;
        },
    };

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule],
        })
            .overrideGuard(CompositeAuthGuard)
            .useValue(mockCompositeAuthGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        if (app) {
            await app.close();
        }
    });

    it('GUEST should not be able to call /tasks (findAll)', () => {
        return request(app.getHttpServer())
            .get('/tasks')
            .expect(403);
    });

    it('GUEST should not be able to call /tasks/archived', () => {
        return request(app.getHttpServer())
            .get('/tasks/archived')
            .expect(403);
    });

    it('GUEST should not be able to call /tasks/count', () => {
        return request(app.getHttpServer())
            .get('/tasks/count')
            .expect(403);
    });

    it('GUEST should be able to call /tasks/board', () => {
        return request(app.getHttpServer())
            .get('/tasks/board')
            .expect(200);
    });

    it('GUEST should not be able to update a task status', () => {
        return request(app.getHttpServer())
            .post('/tasks/1/status')
            .send({ status: 'SUCCESS', date: '2024-01-01' })
            .expect(403);
    });
});
