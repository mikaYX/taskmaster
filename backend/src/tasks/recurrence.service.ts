import { Injectable, Logger } from '@nestjs/common';
import { RRule, RRuleSet, rrulestr } from 'rrule';
import { addMinutes } from 'date-fns';

@Injectable()
export class RecurrenceService {
  private readonly logger = new Logger(RecurrenceService.name);

  /**
   * Preview upcoming occurrences for an RRule
   */
  getPreview(
    rruleString: string,
    startDate: Date,
    timezone: string,
    limit: number = 10,
  ): Date[] {
    try {
      // 1. Convert DB/API UTC date to "Local" time in target timezone
      // RRule works on "floating" local times.
      // e.g. 9am UTC -> 10am Paris (if winter). RRule needs 10am to generate 10am occurrences.
      const zonedStart = this.toZonedTimeSafe(startDate, timezone);

      const options = RRule.parseString(rruleString);
      options.dtstart = zonedStart;

      const rule = new RRule(options);

      // 2. Generate dates (these are "local" to the timezone)
      const localDates = rule.all((d, i) => (i || 0) < limit);

      // 3. Convert back to UTC for storage/API
      return localDates.map((d) => this.fromZonedTimeSafe(d, timezone));
    } catch (error) {
      this.logger.error(`Failed to parse RRule: ${rruleString}`, error);
      return [];
    }
  }

  /**
   * Generate instances between range
   */
  getInstancesInRange(
    rruleString: string,
    startDate: Date,
    rangeStart: Date,
    rangeEnd: Date,
    timezone: string,
  ): Date[] {
    try {
      // Validation
      if (!this.isValidTimezone(timezone)) {
        this.logger.warn(`Invalid timezone: ${timezone}, falling back to UTC`);
        timezone = 'UTC';
      }

      const zonedStart = this.toZonedTimeSafe(startDate, timezone);

      // Range must also be converted to compare with local RRule dates?
      // Actually, RRule.between takes dates. If we pass UTC dates to a local-based RRule, it confuses it?
      // Yes. RRule instance is "local". `between` args should be in same "scale".
      // So we convert range to zoned time too.
      const zonedRangeStart = this.toZonedTimeSafe(rangeStart, timezone);
      const zonedRangeEnd = this.toZonedTimeSafe(rangeEnd, timezone);

      const options = RRule.parseString(rruleString);
      options.dtstart = zonedStart;

      const rule = new RRule(options);

      const localDates = rule.between(zonedRangeStart, zonedRangeEnd, true);

      return localDates.map((d) => this.fromZonedTimeSafe(d, timezone));
    } catch (error) {
      this.logger.error(`Failed to generate instances for range`, error);
      return [];
    }
  }

  private isValidTimezone(tz: string): boolean {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }

  // Helper to get a UTC date whose components match the Wall Clock time in the target timezone.
  // E.g. 09:00 Paris -> 09:00 UTC
  private toZonedTimeSafe(date: Date, timezone: string): Date {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      fractionalSecondDigits: 3,
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const p: any = {};
    parts.forEach(({ type, value }) => {
      if (type !== 'literal') p[type] = parseInt(value, 10);
    });

    // Handle explicit 24h edge case if necessary, but Intl usually 0-23
    if (p.hour === 24) p.hour = 0;

    return new Date(
      Date.UTC(
        p.year,
        p.month - 1,
        p.day,
        p.hour,
        p.minute,
        p.second,
        p.fractionalSecond || 0,
      ),
    );
  }

  // Reverse of toZonedTimeSafe.
  // Given a date whose UTC components represent the Wall Clock time in TZ,
  // find the actual UTC timestamp.
  private fromZonedTimeSafe(date: Date, timezone: string): Date {
    // Iterative approximation
    // 1. Guess UTC = date (treating date's UTC components as the timestamp)
    // This is usually off by the timezone offset.
    let guess = new Date(date);

    // Limit iterations to avoid infinite loops in weird cases
    for (let i = 0; i < 3; i++) {
      const actualLocal = this.toZonedTimeSafe(guess, timezone);
      const diff = actualLocal.getTime() - date.getTime();

      if (diff === 0) return guess;

      // Adjust guess
      guess = new Date(guess.getTime() - diff);
    }
    return guess;
  }

  /**
   * FROM_COMPLETION: compute next occurrence by applying the rrule interval
   * once from the anchor date (lastCompletedAt or startDate).
   */
  /**
   * FROM_COMPLETION: compute next occurrence.
   * @param isFirstRun If true, we look for first occurrence >= anchor. If false, we look for first occurrence > anchor.
   */
  getNextFromCompletion(
    rruleString: string,
    anchorDate: Date,
    timezone: string,
    isFirstRun: boolean = false,
  ): Date | null {
    try {
      if (!this.isValidTimezone(timezone)) {
        timezone = 'UTC';
      }

      const zonedAnchor = this.toZonedTimeSafe(anchorDate, timezone);

      const options = RRule.parseString(rruleString);
      options.dtstart = zonedAnchor;

      // If strictly from completion (isFirstRun=false), we want dates AFTER anchor.
      // But RRule.after() is exclusive? or inclusive?
      // RRule.after(dt, inc=false) -> strict after.
      // RRule.after(dt, inc=true) -> inclusive.

      const rule = new RRule(options);

      // Calculation strategy:
      // 1. If First Run: We want the first valid occurrence >= StartDate.
      //    Check if anchor itself is valid?
      //    rule.after(zonedAnchor, true); -> If anchor matches, returns anchor. Else next.
      //
      // 2. If Sequence (Last Terminal): We want FIRST occurrence > LastTerminal.
      //    rule.after(zonedAnchor, false);

      const nextLocal = rule.after(zonedAnchor, isFirstRun);

      if (!nextLocal) return null;

      return this.fromZonedTimeSafe(nextLocal, timezone);
    } catch (error) {
      this.logger.error(
        `FROM_COMPLETION RRule parse failed: ${rruleString}`,
        error,
      );
      return null;
    }
  }

  validateRRule(rruleString: string): boolean {
    try {
      RRule.parseString(rruleString);
      return true;
    } catch {
      return false;
    }
  }
}
