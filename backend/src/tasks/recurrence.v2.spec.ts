import { Test, TestingModule } from '@nestjs/testing';
import { RecurrenceService } from './recurrence.service';
import { toZonedTime } from 'date-fns-tz';

describe('RecurrenceService V2 Hardening', () => {
  let service: RecurrenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RecurrenceService],
    }).compile();

    service = module.get<RecurrenceService>(RecurrenceService);
  });

  describe('Timezone & DST Handling', () => {
    // ... (DST tests as planned) ...
    it('should handle Paris DST transition (March - Winter to Summer)', () => {
      // Rule: Daily at 09:00 Paris time (08:00 UTC -> 07:00 UTC)
      const rrule = 'FREQ=DAILY;COUNT=3';
      const startDate = new Date('2024-03-30T08:00:00Z'); // 09:00 Paris Winter
      const timezone = 'Europe/Paris';

      const results = service.getPreview(rrule, startDate, timezone, 5);

      expect(results.length).toBe(3);

      // Expected: 08:00 UTC (Mar 30), 07:00 UTC (Mar 31), 07:00 UTC (Apr 1)
      expect(results[0].toISOString()).toBe('2024-03-30T08:00:00.000Z');
      expect(results[1].toISOString()).toBe('2024-03-31T07:00:00.000Z');
      expect(results[2].toISOString()).toBe('2024-04-01T07:00:00.000Z');
    });

    it('should handle New York DST transition (November - Summer to Winter)', () => {
      // Rule: Daily at 09:00 NY time (13:00 UTC -> 14:00 UTC)
      const rrule = 'FREQ=DAILY;COUNT=3';
      const startDate = new Date('2024-11-02T13:00:00Z'); // 09:00 NY Summer
      const timezone = 'America/New_York';

      const results = service.getPreview(rrule, startDate, timezone, 5);

      expect(results[0].toISOString()).toBe('2024-11-02T13:00:00.000Z');
      expect(results[1].toISOString()).toBe('2024-11-03T14:00:00.000Z');
      expect(results[2].toISOString()).toBe('2024-11-04T14:00:00.000Z');
    });
  });

  describe('RRule Logic Validation', () => {
    it('should validate valid RRule string', () => {
      expect(service.validateRRule('FREQ=DAILY')).toBe(true);
    });
    it('should reject invalid RRule string', () => {
      expect(service.validateRRule('NOT_AN_RRULE')).toBe(false);
    });
  });
});
