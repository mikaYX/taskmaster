import { IsValidRecurrenceDateConstraint } from './date-recurrence.validator';
import {
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
  startOfMonth,
  subMonths,
  startOfYear,
  subYears,
} from 'date-fns';

describe('IsValidRecurrenceDateConstraint', () => {
  let validator: IsValidRecurrenceDateConstraint;

  beforeEach(() => {
    validator = new IsValidRecurrenceDateConstraint();
  });

  describe('DAILY recurrence', () => {
    it('should accept today as startDate', () => {
      const today = startOfDay(new Date());
      const result = validator.validate(today, {
        object: { recurrence: 'DAILY', startDate: today },
      } as any);
      expect(result).toBe(true);
    });

    it('should reject yesterday as startDate', () => {
      const yesterday = subDays(new Date(), 1);
      const result = validator.validate(yesterday, {
        object: { recurrence: 'DAILY', startDate: yesterday },
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('WEEKLY recurrence', () => {
    it('should accept this week as dueDate', () => {
      const thisWeek = new Date();
      const result = validator.validate(thisWeek, {
        object: { recurrence: 'WEEKLY', dueDate: thisWeek },
      } as any);
      expect(result).toBe(true);
    });

    it('should reject 2 weeks ago as dueDate', () => {
      const twoWeeksAgo = subWeeks(new Date(), 2);
      const result = validator.validate(twoWeeksAgo, {
        object: { recurrence: 'WEEKLY', dueDate: twoWeeksAgo },
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('MONTHLY recurrence', () => {
    it('should accept this month as dueDate', () => {
      const thisMonth = new Date();
      const result = validator.validate(thisMonth, {
        object: { recurrence: 'MONTHLY', dueDate: thisMonth },
      } as any);
      expect(result).toBe(true);
    });

    it('should reject 2 months ago as dueDate', () => {
      const twoMonthsAgo = subMonths(new Date(), 2);
      const result = validator.validate(twoMonthsAgo, {
        object: { recurrence: 'MONTHLY', dueDate: twoMonthsAgo },
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('YEARLY recurrence', () => {
    it('should accept this year as dueDate', () => {
      const thisYear = new Date();
      const result = validator.validate(thisYear, {
        object: { recurrence: 'YEARLY', dueDate: thisYear },
      } as any);
      expect(result).toBe(true);
    });

    it('should reject 2 years ago as dueDate', () => {
      const twoYearsAgo = subYears(new Date(), 2);
      const result = validator.validate(twoYearsAgo, {
        object: { recurrence: 'YEARLY', dueDate: twoYearsAgo },
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('CUSTOM recurrence (CRON)', () => {
    it('should accept today as dueDate', () => {
      const today = startOfDay(new Date());
      const result = validator.validate(today, {
        object: { periodicity: 'CRON', dueDate: today },
      } as any);
      expect(result).toBe(true);
    });

    it('should reject yesterday as dueDate', () => {
      const yesterday = subDays(new Date(), 1);
      const result = validator.validate(yesterday, {
        object: { periodicity: 'CRON', dueDate: yesterday },
      } as any);
      expect(result).toBe(false);
    });
  });

  describe('Non-recurrent tasks', () => {
    it('should accept any date if periodicity is ONCE', () => {
      const yesterday = subDays(new Date(), 1);
      const result = validator.validate(yesterday, {
        object: { periodicity: 'ONCE', startDate: yesterday },
      } as any);
      expect(result).toBe(true);
    });

    it('should accept any date if no recurrence is provided', () => {
      const yesterday = subDays(new Date(), 1);
      const result = validator.validate(yesterday, {
        object: { startDate: yesterday },
      } as any);
      expect(result).toBe(true);
    });
  });
});
