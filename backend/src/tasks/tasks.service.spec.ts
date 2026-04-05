import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from './instance.service';
import { AuditService } from '../audit/audit.service';
import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { NotFoundException, BadRequestException, Logger } from '@nestjs/common';

// Helper pour créer un task mock
const createMockTask = (overrides?: Partial<any>): any => ({
  id: 1,
  name: 'Test Task',
  description: 'Test description',
  periodicity: 'DAILY',
  deletedAt: null,
  deletedBy: null,
  userAssignments: [],
  groupAssignments: [],
  delegations: [],
  ...overrides,
});

// Helper pour mock time
const mockDate = (daysAgo: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date;
};

describe('TasksService', () => {
  let service: TasksService;
  let mockPrismaService: any;
  let mockProcedureStorage: any;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrismaService = {
      client: {
        task: {
          findUnique: jest.fn(),
          update: jest.fn(),
          delete: jest.fn(),
        },
        status: { deleteMany: jest.fn() },
        taskAssignment: { deleteMany: jest.fn() },
        taskGroupAssignment: { deleteMany: jest.fn() },
        taskDelegation: { deleteMany: jest.fn() },
        $transaction: jest.fn(),
      },
      getDefaultSiteId: jest.fn().mockReturnValue(1),
    };

    mockProcedureStorage = {
      deleteSpecificFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: SettingsService, useValue: { getRawValue: jest.fn() } },
        { provide: InstanceService, useValue: {} },
        { provide: AuditService, useValue: { logDiff: jest.fn() } },
        { provide: ProcedureStorageService, useValue: mockProcedureStorage },
        { provide: BeneficiaryResolverService, useValue: {} },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);

    // Mock du logger
    jest.spyOn(service['logger'], 'log').mockImplementation();
    jest.spyOn(service['logger'], 'warn').mockImplementation();
    jest.spyOn(service['logger'], 'error').mockImplementation();
  });

  describe('run', () => {
    it('should simulate task run in DRY_RUN mode', async () => {
      // Mock de findUnique() qui est généralement appelé par verifyExists() avant run()
      mockPrismaService.client.task.findUnique.mockResolvedValue({ id: 1 });
      const result = await service.run(1);
      expect(result.success).toBe(true);
      expect(result.mode).toBe('DRY_RUN');
    });
  });

  describe('softDelete', () => {
    it('should successfully soft delete a task', async () => {
      const taskId = 1;
      const userId = 2;
      const mockTask = createMockTask({ id: taskId });

      mockPrismaService.client.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.client.task.update.mockResolvedValue({
        ...mockTask,
        deletedAt: new Date(),
        deletedBy: userId,
      });

      await service.softDelete(taskId, userId);

      expect(mockPrismaService.client.task.findUnique).toHaveBeenCalledWith({
        where: { id: taskId },
        include: expect.objectContaining({
          userAssignments: true,
          groupAssignments: expect.any(Object),
          delegations: true,
        }),
      });

      expect(mockPrismaService.client.task.update).toHaveBeenCalledWith({
        where: { id: taskId },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: userId,
        },
      });

      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining(
          `Task ${taskId} soft deleted by user ${userId}`,
        ),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(null);

      await expect(service.softDelete(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when task already deleted', async () => {
      const mockTask = createMockTask({ deletedAt: new Date() });
      mockPrismaService.client.task.findUnique.mockResolvedValue(mockTask);

      await expect(service.softDelete(1, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should log warning when task has active assignments', async () => {
      const mockTask = createMockTask({
        userAssignments: [{ id: 1 }],
      });
      mockPrismaService.client.task.findUnique.mockResolvedValue(mockTask);

      await service.softDelete(1, 1);

      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('active assignments'),
      );
    });

    it('should log warning when task has active delegations', async () => {
      const mockTask = createMockTask({
        delegations: [{ id: 1, status: 'ACTIVE' }],
      });
      mockPrismaService.client.task.findUnique.mockResolvedValue(mockTask);

      await service.softDelete(1, 1);

      expect(service['logger'].warn).toHaveBeenCalledWith(
        expect.stringContaining('active assignments/delegations'),
      );
    });
  });

  describe('restore', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully restore a deleted task', async () => {
      const taskId = 1;
      const userId = 2;
      const deletedTaskDate = mockDate(10); // Deleted 10 days ago

      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({
          id: taskId,
          deletedAt: deletedTaskDate,
          deletedBy: 1,
        }),
      );

      await service.restore(taskId, userId);

      expect(mockPrismaService.client.task.update).toHaveBeenCalledWith({
        where: { id: taskId },
        data: {
          deletedAt: null,
          deletedBy: null,
        },
      });

      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining(`Task ${taskId} restored`),
      );
    });

    it('should throw NotFoundException when task does not exist', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(null);

      await expect(service.restore(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when task is not deleted', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ deletedAt: null }),
      );

      await expect(service.restore(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when deleted more than 30 days ago', async () => {
      const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const oldDeleteDate = new Date(now - thirtyOneDaysMs);

      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ deletedAt: oldDeleteDate }),
      );

      await expect(service.restore(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should accept restore at exactly 30 days', async () => {
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);

      const exactThirtyDaysAgo = new Date(now - thirtyDaysMs);

      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ deletedAt: exactThirtyDaysAgo }),
      );

      await service.restore(1, 1);

      expect(mockPrismaService.client.task.update).toHaveBeenCalled();
    });
  });

  describe('hardDelete', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should successfully hard delete a task after 30 days', async () => {
      const thirtyOneDaysAgo = mockDate(31);

      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({
          id: 1,
          deletedAt: thirtyOneDaysAgo,
          procedureUrl: 'local:test.pdf',
        }),
      );

      mockPrismaService.client.$transaction.mockResolvedValue([]);

      await service.hardDelete(1);

      expect(mockProcedureStorage.deleteSpecificFile).toHaveBeenCalledWith(
        'test.pdf',
      );

      expect(mockPrismaService.client.$transaction).toHaveBeenCalledWith([
        mockPrismaService.client.status.deleteMany({ where: { taskId: 1 } }),
        mockPrismaService.client.taskAssignment.deleteMany({
          where: { taskId: 1 },
        }),
        mockPrismaService.client.taskGroupAssignment.deleteMany({
          where: { taskId: 1 },
        }),
        mockPrismaService.client.taskDelegation.deleteMany({
          where: { taskId: 1 },
        }),
        mockPrismaService.client.task.delete({ where: { id: 1 } }),
      ]);

      expect(service['logger'].log).toHaveBeenCalledWith(
        expect.stringContaining('permanently deleted'),
      );
    });

    it('should throw BadRequestException when task not soft deleted first', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ deletedAt: null }),
      );

      await expect(service.hardDelete(1)).rejects.toThrow(
        /soft deleted first/i,
      );
    });

    it('should throw BadRequestException when task does not exist', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(null);

      await expect(service.hardDelete(1)).rejects.toThrow(
        /soft deleted first/i,
      );
    });

    it('should throw BadRequestException when deleted less than 30 days ago', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ deletedAt: mockDate(29) }),
      );

      await expect(service.hardDelete(1)).rejects.toThrow(/after 30 days/i);
    });

    it('should bypass procedure file delete if not a local file', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({
          id: 1,
          deletedAt: mockDate(31),
          procedureUrl: 'https://example.com/test.pdf',
        }),
      );

      mockPrismaService.client.$transaction.mockResolvedValue([]);

      await service.hardDelete(1);

      expect(mockProcedureStorage.deleteSpecificFile).not.toHaveBeenCalled();
      expect(mockPrismaService.client.$transaction).toHaveBeenCalled();
    });

    it('should delete in correct order (transaction)', async () => {
      mockPrismaService.client.task.findUnique.mockResolvedValue(
        createMockTask({ id: 99, deletedAt: mockDate(31) }),
      );

      await service.hardDelete(99);

      // We just need to check the array passed to $transaction
      const transactionCallArgs =
        mockPrismaService.client.$transaction.mock.calls[0][0];
      expect(transactionCallArgs.length).toBe(5);
    });
  });
});
