import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service'; // IDE Sync
import { PrismaService } from '../prisma';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { AuditService } from '../audit/audit.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';

describe('TasksService Recurrence Validation', () => {
  let service: TasksService;
  let prisma: any;
  let settings: any;

  const mockTask = {
    id: 1,
    description: 'Legacy Task',
    periodicity: 'daily',
    recurrenceMode: null,
    rrule: null,
    timezone: null,
    userAssignments: [],
    groupAssignments: [],
    delegations: [],
  };

  beforeEach(async () => {
    prisma = {
      client: {
        task: {
          create: jest.fn(),
          findUnique: jest.fn(),
          update: jest.fn(),
        },
        taskDelegation: { deleteMany: jest.fn() },
        $transaction: jest.fn(),
      },
      getDefaultSiteId: jest.fn().mockReturnValue(1),
    };

    settings = {
      getRawValue: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: prisma },
        { provide: SettingsService, useValue: settings },
        { provide: ConfigService, useValue: {} },
        {
          provide: InstanceService,
          useValue: { computeInstances: jest.fn().mockReturnValue([]) },
        },
        {
          provide: RecurrenceService,
          useValue: { getPreview: jest.fn().mockReturnValue([]) },
        },
        { provide: AuditService, useValue: { logDiff: jest.fn() } },
        { provide: ProcedureStorageService, useValue: {} },
        { provide: BeneficiaryResolverService, useValue: {} },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  describe('create', () => {
    it('should throw if FROM_COMPLETION is used but flag is OFF', async () => {
      settings.getRawValue.mockImplementation((key: string) => {
        if (key === 'FROM_COMPLETION_ENABLED') return Promise.resolve(false);
        return Promise.resolve(null);
      });

      await expect(
        service.create({
          name: 'Test Task',
          description: 'Test',
          periodicity: 'daily',
          startDate: new Date().toISOString(),
          recurrenceMode: 'FROM_COMPLETION',
          rrule: 'FREQ=DAILY',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if FROM_COMPLETION is used (flag is ON) but NO RRULE', async () => {
      settings.getRawValue.mockImplementation((key: string) =>
        Promise.resolve(true),
      ); // All ON

      await expect(
        service.create({
          name: 'Test Task',
          description: 'Test',
          periodicity: 'daily',
          startDate: new Date().toISOString(),
          recurrenceMode: 'FROM_COMPLETION',
          // No rrule
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed if FROM_COMPLETION is used (flag is ON) with RRULE', async () => {
      settings.getRawValue.mockImplementation((key: string) =>
        Promise.resolve(true),
      ); // All ON
      prisma.client.task.create.mockResolvedValue({
        ...mockTask,
        id: 2,
        recurrenceMode: 'FROM_COMPLETION',
      });

      await service.create({
        name: 'Test Task',
        description: 'Test',
        periodicity: 'daily',
        startDate: new Date().toISOString(),
        recurrenceMode: 'FROM_COMPLETION',
        rrule: 'FREQ=DAILY',
      });

      expect(prisma.client.task.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should throw if FROM_COMPLETION is used but flag is OFF', async () => {
      settings.getRawValue.mockImplementation((key: string) => {
        if (key === 'FROM_COMPLETION_ENABLED') return Promise.resolve(false);
        return Promise.resolve(null);
      });
      prisma.client.task.findUnique.mockResolvedValue(mockTask);

      await expect(
        service.update(1, {
          recurrenceMode: 'FROM_COMPLETION',
          rrule: 'FREQ=DAILY',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw if FROM_COMPLETION is used (flag is ON) but NO RRULE and Task has NO RRULE', async () => {
      settings.getRawValue.mockImplementation((key: string) =>
        Promise.resolve(true),
      );
      prisma.client.task.findUnique.mockResolvedValue(mockTask); // mockTask has null rrule

      await expect(
        service.update(1, {
          recurrenceMode: 'FROM_COMPLETION',
          // No rrule in update
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should succeed if FROM_COMPLETION is used (flag is ON) and Task HAS RRULE', async () => {
      settings.getRawValue.mockImplementation((key: string) =>
        Promise.resolve(true),
      );
      const existingTaskWithRRule = { ...mockTask, rrule: 'FREQ=DAILY' };
      prisma.client.task.findUnique.mockResolvedValue(existingTaskWithRRule);
      prisma.client.task.update.mockResolvedValue(existingTaskWithRRule);

      await service.update(1, {
        recurrenceMode: 'FROM_COMPLETION',
      });

      expect(prisma.client.task.update).toHaveBeenCalled();
    });
  });
  describe('preview', () => {
    it('should throw if FROM_COMPLETION is used but flag is OFF', async () => {
      settings.getRawValue.mockImplementation((key: string) => {
        if (key === 'FROM_COMPLETION_ENABLED') return Promise.resolve(false);
        return Promise.resolve(null);
      });

      await expect(
        service.preview({
          name: 'Test Task',
          description: 'Test',
          periodicity: 'daily',
          startDate: new Date().toISOString(),
          recurrenceMode: 'FROM_COMPLETION',
          rrule: 'FREQ=DAILY',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should cap preview at 10 instances (global cap)', async () => {
      settings.getRawValue.mockResolvedValue(true);

      const mockInstances = Array.from({ length: 15 }, (_, i) => ({
        taskId: 0,
        date: new Date(),
        originalDate: new Date(),
        periodicity: 'daily',
      }));

      const computeSpy = jest
        .spyOn(service['instanceService'], 'computeInstances')
        .mockReturnValue(mockInstances as any);

      const result = await service.preview({
        name: 'Test Task',
        description: 'Test',
        periodicity: 'daily',
        startDate: new Date().toISOString(),
      });

      expect(computeSpy).toHaveBeenCalled();
      expect(result.length).toBe(10); // Capped at 10
    });

    it('should use dto.startDate as rangeStart for underlying computeInstances', async () => {
      settings.getRawValue.mockImplementation((key: string) => {
        if (key === 'app.country') return Promise.resolve('FR');
        return Promise.resolve(undefined);
      });
      const computeSpy = jest
        .spyOn(service['instanceService'], 'computeInstances')
        .mockReturnValue([] as any);

      const startDate = new Date('2030-01-01T00:00:00Z');
      await service.preview({
        name: 'Test Task',
        description: 'Test',
        periodicity: 'daily',
        startDate: startDate.toISOString(),
      });

      expect(computeSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Date), // rangeStart mapped to startDate
        expect.any(Date), // rangeEnd mapped to logic
        expect.any(String),
        undefined,
        expect.anything(),
      );

      // Verify the precise date passed is the provided startDate
      const callArgs = computeSpy.mock.calls[0];
      const passedRangeStart = callArgs[1];
      expect(passedRangeStart.toISOString()).toBe('2030-01-01T00:00:00.000Z');
    });
    describe('preview - behavior semantic proofs', () => {
      let taskSvcReal: TasksService;
      beforeEach(() => {
        const recSvc = new RecurrenceService();
        // Need a dummy logger or let it use default
        const instSvc = new InstanceService(recSvc);
        taskSvcReal = new TasksService(
          prisma,
          {} as any, // configService
          settings, // settingsService
          instSvc, // instanceService
          {} as any, // auditService
          {} as any, // procedureStorageService
          {} as any, // beneficiaryResolver
        );
      });

      it('should generate limited instances for extremely sparse YEARLY rule (cas limite clairsemé)', async () => {
        settings.getRawValue.mockImplementation((key: string) => {
          if (key === 'app.country') return Promise.resolve('FR');
          if (key === 'SCHEDULE_DEFAULT_START_TIME')
            return Promise.resolve('08:00');
          if (key === 'SCHEDULE_DEFAULT_END_TIME')
            return Promise.resolve('18:00');
          return Promise.resolve(undefined);
        });

        const startDate = new Date('2024-01-01T00:00:00Z');
        const result = await taskSvcReal.preview({
          name: 'Test Task',
          description: 'Sparse Task',
          periodicity: 'rrule',
          recurrenceMode: 'ON_SCHEDULE',
          rrule: 'FREQ=YEARLY;INTERVAL=10',
          startDate: startDate.toISOString(),
          timezone: 'UTC',
        });

        // Output should be heavily truncated because rangeEnd = +60 months (5 years)
        // so it only returns the initial instance (2024) and misses 2034.
        expect(result.length).toBe(1);
        expect(result[0].date).toEqual(new Date('2024-01-01T00:00:00.000Z'));
      });

      it('should generate historical instances when startDate is in the past (sémantique métier historique)', async () => {
        settings.getRawValue.mockImplementation((key: string) => {
          if (key === 'app.country') return Promise.resolve('FR');
          if (key === 'SCHEDULE_DEFAULT_START_TIME')
            return Promise.resolve('08:00');
          if (key === 'SCHEDULE_DEFAULT_END_TIME')
            return Promise.resolve('18:00');
          return Promise.resolve(undefined);
        });

        // Past date e.g. 2020
        const startDate = new Date('2020-01-15T00:00:00Z');
        const result = await taskSvcReal.preview({
          name: 'Test Task',
          description: 'Past Task',
          periodicity: 'rrule',
          recurrenceMode: 'ON_SCHEDULE',
          rrule: 'FREQ=MONTHLY;INTERVAL=1',
          startDate: startDate.toISOString(),
          timezone: 'UTC',
        });

        // Should show the 10 first HISTORICAL occurrences following the start date literally
        // rather than skipping forward to 'now'
        expect(result.length).toBe(10);
        expect(result[0].date).toEqual(new Date('2020-01-15T00:00:00.000Z'));
        expect(result[9].date).toEqual(new Date('2020-10-15T00:00:00.000Z'));
      });

      it('should generate at least 1 instance for extremely distant future task (sémantique métier future lointaine)', async () => {
        settings.getRawValue.mockImplementation((key: string) => {
          if (key === 'app.country') return Promise.resolve('FR');
          if (key === 'SCHEDULE_DEFAULT_START_TIME')
            return Promise.resolve('08:00');
          if (key === 'SCHEDULE_DEFAULT_END_TIME')
            return Promise.resolve('18:00');
          return Promise.resolve(undefined);
        });

        // Far future date e.g. 2034
        const startDate = new Date('2034-01-01T00:00:00Z');
        const result = await taskSvcReal.preview({
          name: 'Test Task',
          description: 'Future Task',
          periodicity: 'rrule',
          recurrenceMode: 'ON_SCHEDULE',
          rrule: 'FREQ=YEARLY;INTERVAL=10',
          startDate: startDate.toISOString(),
          timezone: 'UTC',
        });

        // Should preserve the anchor instance (2034) regardless of it being far outside "now + 60 months"
        expect(result.length).toBeGreaterThan(0);
        expect(result[0].date).toEqual(new Date('2034-01-01T00:00:00.000Z'));
      });
    });
  });
});
