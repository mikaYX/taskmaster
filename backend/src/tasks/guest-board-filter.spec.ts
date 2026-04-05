import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { ProcedureStorageService } from './procedure-storage.service';
import { ConfigService } from '@nestjs/config';
import { CompositeAuthGuard } from '../auth/guards/composite-auth.guard';
import { RolesGuard } from '../auth';

describe('TasksController Guest Board Filter', () => {
  let controller: TasksController;
  let service: TasksService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        {
          provide: TasksService,
          useValue: {
            getBoardItems: jest.fn(),
          },
        },
        {
          provide: ProcedureStorageService,
          useValue: {},
        },
        {
          provide: ConfigService,
          useValue: {},
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {},
        },
      ],
    })
      .overrideGuard(CompositeAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TasksController>(TasksController);
    service = module.get<TasksService>(TasksService);
  });

  it('should explicitly force status RUNNING and ignore filtering parameters when role is GUEST', async () => {
    const user = { sub: 1, role: 'GUEST', groupIds: [], username: 'guest' };

    await controller.getBoard(
      undefined, // start
      undefined, // end
      '2', // filterUserId
      '3', // filterGroupId
      'taskName', // sortBy
      'false', // sortDesc
      '1', // page
      '10', // limit
      'MISSING', // status
      'HIGH', // priority
      'Proj', // project
      'Cat', // category
      user as any,
    );

    expect(service.getBoardItems).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      1,
      [],
      false, // isAdmin
      undefined, // filterUserId ignored
      undefined, // filterGroupId ignored
      {
        sortBy: undefined, // ignored
        sortDesc: false,
        page: undefined, // ignored
        limit: undefined, // ignored
        status: 'RUNNING', // forced to RUNNING instead of MISSING
        priority: undefined, // ignored
        project: undefined, // ignored
        category: undefined, // ignored
      },
    );
  });

  it('should pass parameters normally when role is NOT GUEST', async () => {
    const user = { sub: 1, role: 'MANAGER', groupIds: [], username: 'manager' };

    await controller.getBoard(
      undefined, // start
      undefined, // end
      '2', // filterUserId
      '3', // filterGroupId
      'taskName', // sortBy
      'false', // sortDesc
      '1', // page
      '10', // limit
      'MISSING', // status
      'HIGH', // priority
      'Proj', // project
      'Cat', // category
      user as any,
    );

    expect(service.getBoardItems).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
      1,
      [],
      true, // isAdmin
      2, // filterUserId
      3, // filterGroupId
      {
        sortBy: 'taskName',
        sortDesc: false,
        page: 1,
        limit: 10,
        status: 'MISSING',
        priority: 'HIGH',
        project: 'Proj',
        category: 'Cat',
      },
    );
  });
});
