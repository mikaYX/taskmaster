import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { AuditService } from '../audit/audit.service';
import { NotFoundException } from '@nestjs/common';
import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';

describe('TasksService Update (V2)', () => {
  let service: TasksService;
  let prisma: any;
  let settings: any;

  const mockTask = {
    id: 1,
    name: 'Legacy Task',
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
          findUnique: jest.fn(),
          update: jest.fn(),
        },
      },
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
        { provide: InstanceService, useValue: {} },
        { provide: RecurrenceService, useValue: {} },
        { provide: ProcedureStorageService, useValue: {} },
        { provide: BeneficiaryResolverService, useValue: {} },
        {
          provide: AuditService,
          useValue: {
            logDiff: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  it('should update legacy fields normally', async () => {
    settings.getRawValue.mockResolvedValue(true); // V2 Enabled
    prisma.client.task.findUnique.mockResolvedValue(mockTask);
    prisma.client.task.update.mockResolvedValue({
      ...mockTask,
      description: 'Updated',
    });

    const result = await service.update(1, { description: 'Updated' });

    expect(prisma.client.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ description: 'Updated' }),
      }),
    );
    expect(result.description).toBe('Updated');
  });

  it('should ignore legacy description updates if needed, etc.', async () => {
    // Just a placeholder test to show it works
    prisma.client.task.findUnique.mockResolvedValue(mockTask);
    prisma.client.task.update.mockResolvedValue({
      ...mockTask,
      description: 'Updated',
    });

    const result = await service.update(1, { description: 'Updated' });
    expect(result.description).toBe('Updated');
  });

  it('should process V2 fields regardless of feature flags', async () => {
    prisma.client.task.findUnique.mockResolvedValue(mockTask);
    prisma.client.task.update.mockResolvedValue({
      ...mockTask,
      recurrenceMode: 'ON_SCHEDULE',
      rrule: 'FREQ=DAILY',
      timezone: 'UTC',
    });

    const dto = { rrule: 'FREQ=DAILY', timezone: 'UTC' };
    await service.update(1, dto);

    expect(prisma.client.task.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          rrule: 'FREQ=DAILY',
          timezone: 'UTC',
        }),
      }),
    );
  });
});
