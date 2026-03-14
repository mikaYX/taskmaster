import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ScheduleService } from './schedule.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings/settings.service';

describe('ScheduleService', () => {
  let service: ScheduleService;

  const mockPrisma = {
    client: {
      task: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      schedule: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      $transaction: jest.fn(),
    },
    getDefaultSiteId: jest.fn().mockReturnValue(1),
  };

  const mockSettings = {
    getRawValue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: SettingsService, useValue: mockSettings },
      ],
    }).compile();

    service = module.get<ScheduleService>(ScheduleService);
  });

  afterEach(() => jest.clearAllMocks());

  const enableFlag = () => mockSettings.getRawValue.mockResolvedValue(true);
  const disableFlag = () => mockSettings.getRawValue.mockResolvedValue(false);

  const mockSchedule = {
    id: 1,
    taskId: 42,
    recurrenceMode: 'ON_SCHEDULE',
    rrule: 'FREQ=DAILY',
    timezone: 'UTC',
    openOffset: 0,
    closeOffset: null,
    dueOffset: null,
    status: 'ACTIVE',
    maxOccurrences: null,
    occurrenceCount: 0,
    endsAt: null,
    pausedAt: null,
    siteId: null,
    label: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('should create a schedule for existing task', async () => {
      enableFlag();
      mockPrisma.client.task.findUnique.mockResolvedValue({ id: 42 });
      mockPrisma.client.schedule.create.mockResolvedValue(mockSchedule);

      const result = await service.create({
        taskId: 42,
        recurrenceMode: 'ON_SCHEDULE',
        rrule: 'FREQ=DAILY',
      });

      expect(result.id).toBe(1);
      expect(result.taskId).toBe(42);
      expect(mockPrisma.client.schedule.create).toHaveBeenCalledTimes(1);
    });

    it('should throw NotFoundException if task does not exist', async () => {
      enableFlag();
      mockPrisma.client.task.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ taskId: 999, recurrenceMode: 'ON_SCHEDULE' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findOne', () => {
    it('should return schedule by id', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);

      const result = await service.findOne(1);
      expect(result.id).toBe(1);
    });

    it('should throw NotFoundException if not found', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('should update a schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.client.schedule.update.mockResolvedValue({
        ...mockSchedule,
        label: 'Updated',
      });

      const result = await service.update(1, { label: 'Updated' });
      expect(result.label).toBe('Updated');
    });

    it('should reject update on CANCELLED schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue({
        ...mockSchedule,
        status: 'CANCELLED',
      });

      await expect(service.update(1, { label: 'Nope' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.client.schedule.delete.mockResolvedValue(mockSchedule);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(mockPrisma.client.schedule.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should throw if schedule not found', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(null);

      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('pause / resume lifecycle', () => {
    it('should pause an ACTIVE schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.client.schedule.update.mockResolvedValue({
        ...mockSchedule,
        status: 'PAUSED',
        pausedAt: new Date(),
      });

      const result = await service.pause(1);
      expect(result.status).toBe('PAUSED');
    });

    it('should reject pause on non-ACTIVE schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue({
        ...mockSchedule,
        status: 'PAUSED',
      });

      await expect(service.pause(1)).rejects.toThrow(BadRequestException);
    });

    it('should resume a PAUSED schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue({
        ...mockSchedule,
        status: 'PAUSED',
      });
      mockPrisma.client.schedule.update.mockResolvedValue({
        ...mockSchedule,
        status: 'ACTIVE',
        pausedAt: null,
      });

      const result = await service.resume(1);
      expect(result.status).toBe('ACTIVE');
    });

    it('should reject resume on non-PAUSED schedule', async () => {
      enableFlag();
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);

      await expect(service.resume(1)).rejects.toThrow(BadRequestException);
    });
  });

  describe('incrementOccurrence', () => {
    it('should increment count without completing', async () => {
      mockPrisma.client.schedule.findUnique.mockResolvedValue(mockSchedule);
      mockPrisma.client.schedule.update.mockResolvedValue({
        ...mockSchedule,
        occurrenceCount: 1,
      });

      const result = await service.incrementOccurrence(1);
      expect(result.occurrenceCount).toBe(1);
    });

    it('should auto-complete when maxOccurrences is reached', async () => {
      const bounded = {
        ...mockSchedule,
        maxOccurrences: 3,
        occurrenceCount: 2,
      };
      mockPrisma.client.schedule.findUnique.mockResolvedValue(bounded);
      mockPrisma.client.schedule.update.mockResolvedValue({
        ...bounded,
        occurrenceCount: 3,
        status: 'COMPLETED',
      });

      const result = await service.incrementOccurrence(1);
      expect(result.status).toBe('COMPLETED');
      expect(result.occurrenceCount).toBe(3);
    });
  });

  describe('createBulk', () => {
    const bulkItems = [
      { taskId: 1, recurrenceMode: 'ON_SCHEDULE', rrule: 'FREQ=DAILY' },
      { taskId: 2, recurrenceMode: 'ON_SCHEDULE', rrule: 'FREQ=WEEKLY' },
      { taskId: 3, recurrenceMode: 'FROM_COMPLETION' },
    ];

    const enableBulk = () => {
      mockSettings.getRawValue.mockResolvedValue(true);
    };

    it('should create schedules in bulk transactionally', async () => {
      enableBulk();
      mockPrisma.client.task.findMany.mockResolvedValue([
        { id: 1 },
        { id: 2 },
        { id: 3 },
      ]);
      mockPrisma.client.$transaction.mockResolvedValue([
        { ...mockSchedule, id: 10, taskId: 1 },
        { ...mockSchedule, id: 11, taskId: 2 },
        { ...mockSchedule, id: 12, taskId: 3 },
      ]);

      const result = await service.createBulk(bulkItems as any);
      expect(result.createdCount).toBe(3);
      expect(result.ids).toEqual([10, 11, 12]);
      expect(mockPrisma.client.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should reject duplicate taskIds', async () => {
      enableBulk();
      const duplicates = [
        { taskId: 1, recurrenceMode: 'ON_SCHEDULE' },
        { taskId: 1, recurrenceMode: 'FROM_COMPLETION' },
      ];

      await expect(service.createBulk(duplicates as any)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if any task is missing', async () => {
      enableBulk();
      mockPrisma.client.task.findMany.mockResolvedValue([{ id: 1 }]);

      const items = [
        { taskId: 1, recurrenceMode: 'ON_SCHEDULE' },
        { taskId: 999, recurrenceMode: 'ON_SCHEDULE' },
      ];

      await expect(service.createBulk(items as any)).rejects.toThrow(
        'Task 999 not found',
      );
      expect(mockPrisma.client.$transaction).not.toHaveBeenCalled();
    });

    it('should throw when SCHEDULE_BULK_ENABLED is false', async () => {
      mockSettings.getRawValue.mockResolvedValueOnce(false); // bulk disabled

      await expect(service.createBulk(bulkItems as any)).rejects.toThrow(
        'Bulk schedule creation is not enabled',
      );
    });
  });
});
