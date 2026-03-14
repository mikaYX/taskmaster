import { Test, TestingModule } from '@nestjs/testing';
import { InstanceService } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { SettingsService } from '../settings/settings.service';
import { Task } from '@prisma/client';

describe('InstanceService V2 Hardening', () => {
  let service: InstanceService;
  let recurrenceService: RecurrenceService;
  let settingsService: SettingsService;

  const mockRecurrenceService = {
    getInstancesInRange: jest.fn(),
  };

  const mockSettingsService = {
    getRawValue: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstanceService,
        { provide: RecurrenceService, useValue: mockRecurrenceService },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<InstanceService>(InstanceService);
    recurrenceService = module.get<RecurrenceService>(RecurrenceService);
    settingsService = module.get<SettingsService>(SettingsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const mockTask = {
    id: 1,
    title: 'Test Task',
    periodicity: 'daily', // Legacy
    startDate: new Date('2024-01-01T00:00:00Z'),
    rrule: 'FREQ=DAILY;COUNT=3',
    timezone: 'UTC',
    recurrenceMode: 'ON_SCHEDULE',
    dueOffset: 0,
    skipWeekends: false,
    skipHolidays: false,
  } as any;

  describe('Due Offset Logic', () => {
    it('should apply dueOffset to periodEnd', () => {
      mockRecurrenceService.getInstancesInRange.mockReturnValue([
        new Date('2024-01-01T10:00:00Z'),
      ]);

      const taskWithOffset = { ...mockTask, dueOffset: 60 }; // 1 hour offset

      const iterator = service.computeInstances(
        taskWithOffset,
        new Date(),
        new Date(),
        'FR',
      );
      const results = Array.from(iterator);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].periodEnd?.toISOString()).toBe(
        '2024-01-01T11:00:00.000Z',
      ); // 10:00 + 1h
    });

    it('should set periodEnd = date if dueOffset is 0', () => {
      mockRecurrenceService.getInstancesInRange.mockReturnValue([
        new Date('2024-01-01T10:00:00Z'),
      ]);

      const taskWithOffset = { ...mockTask, dueOffset: 0 };

      const iterator = service.computeInstances(
        taskWithOffset,
        new Date(),
        new Date(),
        'FR',
      );
      const results = Array.from(iterator);

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].periodEnd?.toISOString()).toBe(
        '2024-01-01T18:00:00.000Z',
      );
    });
  });

  describe('Recurrence Mode Logic', () => {
    it('should fallback to ON_SCHEDULE (rrule) when FROM_COMPLETION has no context', () => {
      mockRecurrenceService.getInstancesInRange.mockReturnValue([
        new Date('2024-01-01T10:00:00Z'),
      ]);

      const taskFC = { ...mockTask, recurrenceMode: 'FROM_COMPLETION' };

      const iterator = service.computeInstances(
        taskFC,
        new Date(),
        new Date(),
        'FR',
      );
      const results = Array.from(iterator);

      // Without FromCompletionContext, routes to generateRRule
      expect(results.length).toBe(1);
      expect(results[0].periodicity).toBe('rrule');
    });
  });
});
