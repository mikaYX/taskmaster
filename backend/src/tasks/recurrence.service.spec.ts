import { Test, TestingModule } from '@nestjs/testing';
import { RecurrenceService } from './recurrence.service';
import { addDays, addHours } from 'date-fns';

describe('RecurrenceService', () => {
  let service: RecurrenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrenceService],
    }).compile();

    service = module.get<RecurrenceService>(RecurrenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPreview', () => {
    it('should generate next 10 occurrences for daily rrule', () => {
      const startDate = new Date('2024-01-01T09:00:00Z');
      const rrule = 'FREQ=DAILY;INTERVAL=1';

      const results = service.getPreview(rrule, startDate, 'UTC', 5);

      expect(results.length).toBe(5);
      expect(results[0]).toEqual(startDate);
      expect(results[1]).toEqual(addDays(startDate, 1));
    });

    it('should handle count limit in rrule', () => {
      const startDate = new Date('2024-01-01T09:00:00Z');
      const rrule = 'FREQ=DAILY;COUNT=3';

      const results = service.getPreview(rrule, startDate, 'UTC', 10);

      expect(results.length).toBe(3);
    });
  });

  describe('getInstancesInRange', () => {
    it('should generate instances strictly within range', () => {
      const startDate = new Date('2024-01-01T09:00:00Z'); // Mon Jan 1
      const rrule = 'FREQ=WEEKLY;BYDAY=MO'; // Every Monday

      // Query range: Jan 10 (Wed) to Jan 25 (Thu)
      // Weeks:
      // Jan 1 (Mon) - start
      // Jan 8 (Mon) - before range
      // Jan 15 (Mon) - in range
      // Jan 22 (Mon) - in range
      // Jan 29 (Mon) - after range

      const rangeStart = new Date('2024-01-10T00:00:00Z');
      const rangeEnd = new Date('2024-01-25T00:00:00Z');

      const results = service.getInstancesInRange(
        rrule,
        startDate,
        rangeStart,
        rangeEnd,
        'UTC',
      );

      expect(results.length).toBe(2);
      expect(results[0]).toEqual(new Date('2024-01-15T09:00:00Z'));
      expect(results[1]).toEqual(new Date('2024-01-22T09:00:00Z'));
    });
  });
});
