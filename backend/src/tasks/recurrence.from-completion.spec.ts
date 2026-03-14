import { Test, TestingModule } from '@nestjs/testing';
import { RecurrenceService } from './recurrence.service';

describe('RecurrenceService — FROM_COMPLETION', () => {
  let service: RecurrenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrenceService],
    }).compile();

    service = module.get<RecurrenceService>(RecurrenceService);
  });

  describe('getNextFromCompletion', () => {
    it('should return next daily occurrence after anchor', () => {
      const anchor = new Date('2024-06-15T14:00:00Z');
      const result = service.getNextFromCompletion('FREQ=DAILY', anchor, 'UTC');

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-06-16T14:00:00.000Z');
    });

    it('should return next weekly occurrence after anchor', () => {
      const anchor = new Date('2024-06-15T09:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=WEEKLY',
        anchor,
        'UTC',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-06-22T09:00:00.000Z');
    });

    it('should return null if COUNT=1 (no next occurrence)', () => {
      const anchor = new Date('2024-06-15T09:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=DAILY;COUNT=1',
        anchor,
        'UTC',
      );

      expect(result).toBeNull();
    });

    it('should handle Paris DST transition (winter -> summer)', () => {
      // Anchor: March 30 at 09:00 Paris (08:00 UTC, winter)
      // Next: March 31 at 09:00 Paris (07:00 UTC, summer)
      const anchor = new Date('2024-03-30T08:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=DAILY',
        anchor,
        'Europe/Paris',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-03-31T07:00:00.000Z');
    });

    it('should handle New York DST transition (summer -> winter)', () => {
      // Anchor: Nov 2 at 09:00 NY (13:00 UTC, summer)
      // Next: Nov 3 at 09:00 NY (14:00 UTC, winter)
      const anchor = new Date('2024-11-02T13:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=DAILY',
        anchor,
        'America/New_York',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-11-03T14:00:00.000Z');
    });

    it('should fallback to UTC on invalid timezone', () => {
      const anchor = new Date('2024-06-15T09:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=DAILY',
        anchor,
        'Invalid/TZ',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-06-16T09:00:00.000Z');
    });

    it('should return null on invalid rrule', () => {
      const anchor = new Date('2024-06-15T09:00:00Z');
      const result = service.getNextFromCompletion('INVALID', anchor, 'UTC');

      expect(result).toBeNull();
    });

    it('should find next matching day when anchor is on a non-BYDAY day (WEEKLY;BYDAY=MO, anchor=Wednesday)', () => {
      // Anchor: Wednesday June 12 2024. Rule: every Monday.
      // RRule dtstart=Wed → next Monday = June 17
      const anchor = new Date('2024-06-12T09:00:00Z'); // Wednesday
      const result = service.getNextFromCompletion(
        'FREQ=WEEKLY;BYDAY=MO',
        anchor,
        'UTC',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-06-17T09:00:00.000Z'); // Next Monday
    });

    it('should find next matching day for MONTHLY;BYMONTHDAY=15 when anchor is on the 20th', () => {
      // Anchor: June 20 2024. Rule: monthly on the 15th.
      // dtstart=June 20 → next 15th = July 15
      const anchor = new Date('2024-06-20T09:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=MONTHLY;BYMONTHDAY=15',
        anchor,
        'UTC',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-07-15T09:00:00.000Z');
    });

    it('should handle MONTHLY;BYMONTHDAY=1 when anchor is already the 1st', () => {
      // Anchor: July 1 2024. Rule: monthly on the 1st.
      // dtstart=July 1 → next 1st = August 1
      const anchor = new Date('2024-07-01T09:00:00Z');
      const result = service.getNextFromCompletion(
        'FREQ=MONTHLY;BYMONTHDAY=1',
        anchor,
        'UTC',
      );

      expect(result).not.toBeNull();
      expect(result!.toISOString()).toBe('2024-08-01T09:00:00.000Z');
    });
  });

  describe('ON_SCHEDULE (non-regression)', () => {
    it('getPreview still works for ON_SCHEDULE daily', () => {
      const start = new Date('2024-01-01T09:00:00Z');
      const results = service.getPreview('FREQ=DAILY;COUNT=3', start, 'UTC', 5);

      expect(results).toHaveLength(3);
      expect(results[0].toISOString()).toBe('2024-01-01T09:00:00.000Z');
      expect(results[1].toISOString()).toBe('2024-01-02T09:00:00.000Z');
      expect(results[2].toISOString()).toBe('2024-01-03T09:00:00.000Z');
    });

    it('getInstancesInRange still works for ON_SCHEDULE', () => {
      const start = new Date('2024-01-01T09:00:00Z');
      const rangeStart = new Date('2024-01-01');
      const rangeEnd = new Date('2024-01-05');
      const results = service.getInstancesInRange(
        'FREQ=DAILY',
        start,
        rangeStart,
        rangeEnd,
        'UTC',
      );

      expect(results.length).toBeGreaterThanOrEqual(4);
    });

    it('validateRRule still works', () => {
      expect(service.validateRRule('FREQ=WEEKLY')).toBe(true);
      expect(service.validateRRule('BAD')).toBe(false);
    });
  });
});
