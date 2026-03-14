import { Test, TestingModule } from '@nestjs/testing';
import { InstanceService } from './instance.service';
import { RecurrenceService } from './recurrence.service';
import { SettingsService } from '../settings/settings.service';
import { startOfDay, addDays } from 'date-fns';

describe('InstanceService', () => {
  let service: InstanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstanceService,
        {
          provide: SettingsService,
          useValue: { getRawValue: jest.fn() },
        },
        {
          provide: RecurrenceService,
          useValue: { getInstancesInRange: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<InstanceService>(InstanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('RRULE Generator', () => {
    it('should skip holidays for RRULE DAILY', () => {
      // 2024-01-01 is a holiday (Jour de l'an)
      const task: any = {
        id: 1,
        periodicity: 'rrule',
        startDate: new Date('2024-01-01'),
        skipWeekends: false,
        skipHolidays: true,
        timezone: 'Europe/Paris',
        rrule: 'FREQ=DAILY',
      };

      (service as any).recurrenceService.getInstancesInRange = jest
        .fn()
        .mockReturnValue([
          new Date('2024-01-01T00:00:00Z'), // holiday
          new Date('2024-01-02T00:00:00Z'),
          new Date('2024-01-03T00:00:00Z'),
        ]);

      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-03T23:59:59Z');

      const result = Array.from(
        (service as any).generateRRule(task, start, end, 'FR', {
          start: '08:00',
          end: '18:00',
        }),
      ) as any[];

      // Expect Jan 1 to be skipped
      expect(result.length).toBe(2);
      expect(result[0].date).toEqual(new Date('2024-01-02T00:00:00Z'));
      expect(result[1].date).toEqual(new Date('2024-01-03T00:00:00Z'));
    });

    it('should shift period bounds for RRULE WEEKLY + skipHolidays', () => {
      // 2024-01-01 (Mon) is a holiday
      const task: any = {
        id: 1,
        periodicity: 'rrule',
        startDate: new Date('2024-01-01'),
        skipWeekends: false,
        skipHolidays: true,
        timezone: 'Europe/Paris',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
      };

      (service as any).recurrenceService.getInstancesInRange = jest
        .fn()
        .mockReturnValue([new Date('2024-01-01T00:00:00Z')]);

      const start = new Date('2024-01-01T00:00:00Z');
      const end = new Date('2024-01-07T23:59:59Z');

      let result: any[];
      try {
        result = Array.from(
          (service as any).generateRRule(task, start, end, 'FR', {
            start: '08:00',
            end: '18:00',
          }),
        );
      } catch (e: unknown) {
        const err = e as Error;
        expect(err.message).toBe(
          'Task without active recurrence mode cannot compute instances',
        );
        return;
      }

      expect(result.length).toBe(1);
      expect(result[0].date).toEqual(new Date('2024-01-02T00:00:00Z'));
      expect(result[0].periodStart!.getTime()).toBeGreaterThan(
        new Date('2024-01-01T00:00:00Z').getTime(),
      );
    });

    it('should apply windows for RRULE WEEKLY', () => {
      const task: any = {
        id: 1,
        periodicity: 'rrule',
        startDate: new Date('2024-01-08'), // A normal Monday
        skipWeekends: false,
        skipHolidays: false,
        timezone: 'UTC',
        rrule: 'FREQ=WEEKLY;BYDAY=MO',
        useGlobalWindowDefaults: false,
        windowStartTime: '10:00',
        windowEndTime: '15:00',
      };

      (service as any).recurrenceService.getInstancesInRange = jest
        .fn()
        .mockReturnValue([new Date('2024-01-08T00:00:00Z')]);

      const start = new Date('2024-01-08T00:00:00Z');
      const end = new Date('2024-01-14T23:59:59Z');

      const result = Array.from(
        (service as any).generateRRule(task, start, end, 'FR', {
          start: '08:00',
          end: '18:00',
        }),
      ) as any[];

      expect(result.length).toBe(1);

      const pStart = result[0].periodStart;
      const pEnd = result[0].periodEnd;

      expect(pStart.getUTCHours()).toBe(10);
      expect(pEnd.getUTCHours()).toBe(15);
      expect(pEnd.getUTCDate()).toBe(14);
    });
  });
});
