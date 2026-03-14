import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TasksController } from './tasks.controller';
import { ProcedureStorageService } from './procedure-storage.service';
import { TasksService } from './tasks.service';

describe('TasksController', () => {
  let controller: TasksController;
  let tasksService: jest.Mocked<TasksService>;

  beforeEach(async () => {
    const mockTasksService = {
      run: jest.fn(),
    };
    const mockDelegationsService = {};

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: ProcedureStorageService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: 'REDIS_CLIENT', useValue: {} },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    tasksService = module.get(TasksService);
  });

  describe('run', () => {
    it('should call service run and return DRY_RUN contract for V1', async () => {
      const runResult = {
        success: true,
        message:
          'Execution engine deactivated for V1. This is a simulated DRY_RUN for task 1.',
        mode: 'DRY_RUN',
      };

      tasksService.run.mockResolvedValue(runResult);

      const result = await controller.run(1);

      expect(tasksService.run).toHaveBeenCalledWith(1);
      expect(result).toEqual(runResult);
    });
  });
});
