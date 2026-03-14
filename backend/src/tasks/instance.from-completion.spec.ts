import { Test, TestingModule } from '@nestjs/testing';
import { InstanceService, FromCompletionContext } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { SettingsService } from '../settings/settings.service';
import { Task } from '@prisma/client';

describe('InstanceService (FROM_COMPLETION Logic)', () => {
  let service: InstanceService;
  let recurrenceService: RecurrenceService;

  const mockSettingsService = {
    getRawValue: jest.fn(),
  };

  // Standard task template
  const baseTask: Task = {
    id: 1,
    title: 'Test Task',
    description: '',
    periodicity: 'daily',
    recurrenceMode: 'FROM_COMPLETION',
    rrule: 'RRULE:FREQ=DAILY;INTERVAL=1', // Default: Daily
    startDate: new Date('2024-01-01T09:00:00Z'), // Monday
    endDate: null,
    activeUntil: null,
    procedureUrl: null,
    skipWeekends: false,
    skipHolidays: false,

    createdAt: new Date(),
    updatedAt: new Date(),
    timezone: 'UTC',
    dueOffset: 0,
  } as any;

  const rangeStart = new Date('2024-01-01T00:00:00Z');
  const rangeEnd = new Date('2024-01-31T23:59:59Z');

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstanceService,
        RecurrenceService,
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<InstanceService>(InstanceService);
    recurrenceService = module.get<RecurrenceService>(RecurrenceService);
  });

  describe('Strict Blocking Rules', () => {
    it('should yield ZERO instances if hasRunningInstance is true', () => {
      const ctx: FromCompletionContext = {
        lastTerminalDate: null,
        hasRunningInstance: true, // BLOCKING
      };

      const generator = service.computeInstances(
        baseTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(0);
    });
  });

  describe('First Run Logic (Anchor = StartDate)', () => {
    it('should yield StartDate if it matches RRule', () => {
      // Task Starts Jan 1st (Mon). RRule Daily.
      // Matches.
      const ctx: FromCompletionContext = {
        lastTerminalDate: null,
        hasRunningInstance: false,
      };

      const generator = service.computeInstances(
        baseTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(1);
      expect(instances[0].date.toISOString()).toBe(
        baseTask.startDate.toISOString(),
      );
    });

    it('should yield NEXT valid date if StartDate does NOT match RRule', () => {
      // Task Starts Jan 2nd (Tue). RRule = BYDAY=MO (Mondays).
      // First run cannot be Jan 2nd. Must be next Monday (Jan 8th).
      const mondayTask = {
        ...baseTask,
        startDate: new Date('2024-01-02T09:00:00Z'), // Tue
        rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO',
      };

      const ctx: FromCompletionContext = {
        lastTerminalDate: null,
        hasRunningInstance: false,
      };

      const generator = service.computeInstances(
        mondayTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(1);
      expect(instances[0].date.toISOString()).toBe('2024-01-08T09:00:00.000Z');
    });
  });

  describe('Sequence Logic (Anchor = Last Terminal Status)', () => {
    it('should yield Next Date relative to Last SUCCESS date', () => {
      const lastSuccess = new Date('2024-01-05T10:00:00Z');
      const ctx: FromCompletionContext = {
        lastTerminalDate: lastSuccess,
        hasRunningInstance: false,
      };

      // RRule: Daily -> Next should be Jan 6th 10:00
      const generator = service.computeInstances(
        baseTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(1);

      const expected = new Date(lastSuccess);
      expected.setDate(expected.getDate() + 1);
      expect(instances[0].date.toISOString()).toBe(expected.toISOString());
    });

    it('should yield Next Date relative to Last FAILED date', () => {
      const lastFailed = new Date('2024-01-10T15:00:00Z');
      const ctx: FromCompletionContext = {
        lastTerminalDate: lastFailed,
        hasRunningInstance: false,
      };

      // RRule: Daily -> Next should be Jan 11th 15:00
      const generator = service.computeInstances(
        baseTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(1);

      const expected = new Date(lastFailed);
      expected.setDate(expected.getDate() + 1);
      expect(instances[0].date.toISOString()).toBe(expected.toISOString());
    });
  });

  describe('Edge Cases', () => {
    it('should yield ZERO if next instance is out of requested range', () => {
      const lastSuccess = new Date('2025-01-01T00:00:00Z');
      const ctx: FromCompletionContext = {
        lastTerminalDate: lastSuccess,
        hasRunningInstance: false,
      };

      const generator = service.computeInstances(
        baseTask,
        rangeStart,
        rangeEnd,
        'FR',
        ctx,
      );
      const instances = Array.from(generator);

      expect(instances).toHaveLength(0);
    });
  });
});
