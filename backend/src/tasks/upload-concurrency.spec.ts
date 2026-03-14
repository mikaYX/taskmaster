import { Test, TestingModule } from '@nestjs/testing';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

import { ProcedureStorageService } from './procedure-storage.service';
import { ConfigService } from '@nestjs/config';

describe('Procedure Upload Concurrency', () => {
  let controller: TasksController;
  let tasksService: jest.Mocked<TasksService>;
  let procedureStorage: jest.Mocked<ProcedureStorageService>;

  beforeEach(async () => {
    const mockTasksService = {
      findOne: jest.fn(),
      update: jest.fn(),
    };
    const mockProcedureStorage = {
      storeProcedureFile: jest.fn(),
      deleteSpecificFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TasksController],
      providers: [
        { provide: TasksService, useValue: mockTasksService },
        { provide: ProcedureStorageService, useValue: mockProcedureStorage },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: 'REDIS_CLIENT', useValue: {} },
      ],
    }).compile();

    controller = module.get<TasksController>(TasksController);
    tasksService = module.get(TasksService);
    procedureStorage = module.get(ProcedureStorageService);
  });

  it('Scenario: Double Upload Concurrency Simulation', async () => {
    // Both requests aim for Task 1, which currently has 'local:1_procedure.pdf'
    tasksService.findOne.mockResolvedValue({
      id: 1,
      procedureUrl: 'local:1_procedure.pdf',
    } as any);

    // Both requests successfully write to the disk buffer sequentially or concurrently
    procedureStorage.storeProcedureFile
      .mockResolvedValueOnce('local:1_procedure_req1.pdf')
      .mockResolvedValueOnce('local:1_procedure_req2.pdf');

    // Mocks for DB update that simulates a race condition:
    // Request 1 succeeds updating the DB
    tasksService.update.mockResolvedValueOnce({
      id: 1,
      procedureUrl: 'local:1_procedure_req1.pdf',
    } as any);

    // Request 2 fails simulating a DB locking or optimistic concurrency error
    tasksService.update.mockRejectedValueOnce(
      new Error('Concurrent Update Crash'),
    );

    const file1: any = {
      buffer: Buffer.from('req1'),
      originalname: 'test1.pdf',
    };
    const file2: any = {
      buffer: Buffer.from('req2'),
      originalname: 'test2.pdf',
    };
    const user: any = { sub: 99, username: 'admin' };

    // Fire both requests concurrently
    const req1Promise = controller.uploadProcedure(1, file1, user);
    const req2Promise = controller.uploadProcedure(1, file2, user);

    // Await resolutions
    const req1Result = await req1Promise;
    await expect(req2Promise).rejects.toThrow('Concurrent Update Crash');

    // Validations:

    // Request 1 succeeded, so it should have asked the storage service to delete the ORIGINAL old file ('1_procedure.pdf')
    expect(req1Result.procedureUrl).toBe('local:1_procedure_req1.pdf');
    expect(procedureStorage.deleteSpecificFile).toHaveBeenCalledWith(
      '1_procedure.pdf',
    );

    // Request 2 failed at the DB step, so its ROLLBACK should have fired to delete its newly created orphaned disk file
    expect(procedureStorage.deleteSpecificFile).toHaveBeenCalledWith(
      '1_procedure_req2.pdf',
    );
  });
});
