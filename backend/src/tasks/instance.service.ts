import { Injectable } from '@nestjs/common';
import { formatInTimeZone } from 'date-fns-tz';
import { Task } from '@prisma/client';
import {
  addDays,
  addMonths,
  isBefore,
  isAfter,
  addMinutes,
  setDate,
  endOfDay,
  isWeekend,
  startOfWeek,
} from 'date-fns';
import {
  applyTimeInZone,
  shiftDateForward,
  shiftDateBackward,
  isHoliday,
  ShiftRules,
} from '../common/utils/date.utils';
import { RecurrenceService } from './recurrence.service';

export interface VirtualInstance {
  taskId: number;
  date: Date;
  originalDate: Date;
  periodicity: string;
  periodStart?: Date;
  periodEnd?: Date;
  rrule?: string;
  isException?: boolean;
}

export interface FromCompletionContext {
  lastTerminalDate: Date | null;
  hasRunningInstance: boolean;
}

export interface WindowSettings {
  start: string;
  end: string;
}

@Injectable()
export class InstanceService {
  constructor(private readonly recurrenceService: RecurrenceService) { }

  /**
   * computeInstances (Lazy)
   * Generates virtual instances for a task within a given date range.
   * Returns an IterableIterator to allow lazy evaluation.
   */
  *computeInstances(
    task: Task & { overrides?: any[] },
    rangeStart: Date,
    rangeEnd: Date,
    country: string,
    fromCompletionCtx?: FromCompletionContext,
    windowDefaults?: WindowSettings,
  ): IterableIterator<VirtualInstance> {
    // 0. Basic Validations
    if (!task.startDate) return;

    // Extract and map overrides for O(1) matching
    const overrideMap = new Map<string, any>();
    const overridesInTargetRange: any[] = [];

    if (task.overrides) {
      for (const ov of task.overrides) {
        const tz = (task as any).timezone || 'UTC';
        const oDate = formatInTimeZone(ov.originalDate, tz, 'yyyy-MM-dd');
        overrideMap.set(oDate, ov);

        // Track overrides that bring instances INTO the current range
        if (ov.action === 'MOVE' && ov.targetDate) {
          const tDate = ov.targetDate;
          if (!isBefore(tDate, rangeStart) && !isAfter(tDate, rangeEnd)) {
            // Target date is inside our view range
            overridesInTargetRange.push(ov);
          }
        }
      }
    }

    const generatedOriginalDates = new Set<string>();

    // We wrap the internal generators to apply the MOVE/SKIP logic
    const generators = this.getGenerators(
      task,
      rangeStart,
      rangeEnd,
      country,
      fromCompletionCtx,
      windowDefaults,
    );

    for (const inst of generators) {
      const tz = (task as any).timezone || 'UTC';
      const oDateStr = formatInTimeZone(inst.originalDate, tz, 'yyyy-MM-dd');
      generatedOriginalDates.add(oDateStr);
      const override = overrideMap.get(oDateStr);

      if (override) {
        if (override.action === 'SKIP') {
          continue; // Drop it
        } else if (override.action === 'MOVE' && override.targetDate) {
          // Offset dates
          const deltaMs = override.targetDate.getTime() - inst.date.getTime();
          inst.date = override.targetDate;
          if (inst.periodStart) {
            inst.periodStart = new Date(inst.periodStart.getTime() + deltaMs);
          }
          if (inst.periodEnd) {
            inst.periodEnd = new Date(inst.periodEnd.getTime() + deltaMs);
          }
          inst.isException = true;
          // Yield only if target date falls in range (or maybe we just yield everything the generator gave us, but we should probably filter on new date)
          if (
            !isBefore(inst.date, rangeStart) &&
            !isAfter(inst.date, rangeEnd)
          ) {
            yield inst;
          }
          continue;
        }
      }

      yield inst;
    }

    // Now, yield any MOVE overrides that landed in our range, but whose original date was completely outside our generated range
    // For example: an event from next month moved to this week.
    for (const ov of overridesInTargetRange) {
      const tz = (task as any).timezone || 'UTC';
      const oDateStr = formatInTimeZone(ov.originalDate, tz, 'yyyy-MM-dd');
      if (!generatedOriginalDates.has(oDateStr)) {
        // We must forge an instance for it
        // We'll use the original date to forge a basic instance, then offset it.
        // In a true lazy pattern, generating a single isolated instance can be complex (we'd need to know its original period limits).
        // We will approximate periodStart/End based on the periodicity type.

        const deltaMs = ov.targetDate.getTime() - ov.originalDate.getTime();
        let pStart = new Date(ov.originalDate);
        let pEnd = new Date(ov.originalDate);

        const freqMatch = (task as any).rrule
          ? (task as any).rrule.match(/FREQ=([A-Z]+)/i)
          : null;
        const freq = freqMatch ? freqMatch[1].toUpperCase() : 'DAILY';

        if (freq === 'DAILY') {
          pEnd = new Date(ov.originalDate);
        } else if (freq === 'WEEKLY') {
          let wkst = 1; // Default Monday
          const wkstMatch = (task as any).rrule
            ? (task as any).rrule.match(/WKST=([A-Z]{2})/i)
            : null;
          if (wkstMatch) {
            const days = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
            const wkstIdx = days.indexOf(wkstMatch[1].toUpperCase());
            if (wkstIdx !== -1) wkst = wkstIdx;
          }
          pStart = startOfWeek(ov.originalDate, { weekStartsOn: wkst as any });
          pEnd = addDays(pStart, 6);
        } else if (freq === 'MONTHLY') {
          pStart = setDate(ov.originalDate, 1);
          pEnd = endOfDay(setDate(addMonths(pStart, 1), 0));
        } else if (freq === 'YEARLY') {
          pStart = new Date(ov.originalDate.getFullYear(), 0, 1);
          pEnd = new Date(
            ov.originalDate.getFullYear(),
            11,
            31,
            23,
            59,
            59,
            999,
          );
        }

        // If dueOffset exists
        if (task.dueOffset && task.dueOffset > 0) {
          pEnd = addMinutes(ov.originalDate, task.dueOffset);
        }

        const inst: VirtualInstance = {
          taskId: task.id,
          date: ov.targetDate,
          originalDate: ov.originalDate,
          periodicity: 'rrule',
          periodStart: new Date(pStart.getTime() + deltaMs),
          periodEnd: new Date(pEnd.getTime() + deltaMs),
          rrule: (task as any).rrule,
          isException: true,
        };

        yield inst;
      }
    }
  }

  private *getGenerators(
    task: Task,
    rangeStart: Date,
    rangeEnd: Date,
    country: string,
    fromCompletionCtx?: FromCompletionContext,
    windowDefaults?: WindowSettings,
  ): IterableIterator<VirtualInstance> {
    const t = task as any;
    if (t.rrule) {
      if (t.recurrenceMode === 'FROM_COMPLETION' && fromCompletionCtx) {
        yield* this.generateFromCompletion(
          task,
          rangeStart,
          rangeEnd,
          fromCompletionCtx,
        );
      } else {
        yield* this.generateRRule(
          task,
          rangeStart,
          rangeEnd,
          country,
          windowDefaults,
        );
      }
    }
  }

  private *generateRRule(
    task: Task,
    rangeStart: Date,
    rangeEnd: Date,
    country: string,
    windowDefaults?: WindowSettings,
  ): IterableIterator<VirtualInstance> {
    const t = task as any;
    if (!t.rrule) return;

    const wStartStr =
      t.useGlobalWindowDefaults === false && t.windowStartTime
        ? t.windowStartTime
        : windowDefaults?.start || '08:00';

    const wEndStr =
      t.useGlobalWindowDefaults === false && t.windowEndTime
        ? t.windowEndTime
        : windowDefaults?.end || '18:00';

    const windowRules: WindowSettings = { start: wStartStr, end: wEndStr };

    const shiftRules: ShiftRules = {
      skipWeekends: task.skipWeekends,
      skipHolidays: task.skipHolidays,
      country: country,
    };

    const freqMatch = t.rrule.match(/FREQ=([A-Z]+)/i);
    const freq = freqMatch ? freqMatch[1].toUpperCase() : 'DAILY';

    const dates = this.recurrenceService.getInstancesInRange(
      t.rrule,
      new Date(task.startDate),
      rangeStart,
      rangeEnd,
      t.timezone || 'UTC',
    );

    for (const date of dates) {
      if (task.activeUntil && isAfter(date, new Date(task.activeUntil)))
        continue;

      let shifted = date;
      let pEndBase = date;

      if (freq === 'WEEKLY' || freq === 'MONTHLY' || freq === 'YEARLY') {
        if (freq === 'WEEKLY') {
          pEndBase = addDays(date, 6);
        } else if (freq === 'MONTHLY') {
          pEndBase = endOfDay(setDate(addMonths(date, 1), 0));
        } else if (freq === 'YEARLY') {
          pEndBase = getYearlyEndDate(task.endDate, date.getFullYear()) || date;
        }

        shifted = shiftDateForward(date, shiftRules);
        pEndBase = shiftDateBackward(pEndBase, shiftRules);

        if (isAfter(shifted, pEndBase)) continue;
      } else {
        let isValid = true;
        if (shiftRules.skipWeekends && isWeekend(date)) isValid = false;
        if (isValid && shiftRules.skipHolidays && isHoliday(country, date))
          isValid = false;
        if (!isValid) continue;
      }

      const periodStart = applyTimeInZone(
        shifted,
        windowRules.start,
        t.timezone,
      );
      let periodEnd = applyTimeInZone(pEndBase, windowRules.end, t.timezone);

      // Si la fenêtre chevauche minuit (ex: 22h00 à 07h00)
      // et que la tâche se termine sur le même jour logique,
      // on ajoute +1 jour réel pour atterrir sur le lendemain matin.
      if (windowRules.start > windowRules.end && periodEnd <= periodStart) {
        periodEnd = addDays(periodEnd, 1);
      }

      if (task.dueOffset && task.dueOffset > 0) {
        periodEnd = addMinutes(shifted, task.dueOffset);
      }

      yield {
        taskId: task.id,
        date: shifted,
        originalDate: date,
        periodicity: 'rrule',
        periodStart,
        periodEnd,
        rrule: t.rrule,
      };
    }
  }

  /**
   * FROM_COMPLETION: yields at most 1 instance.
   * Anchor = lastTerminalDate ?? task.startDate.
   * If a RUNNING instance exists, yields nothing (wait for completion).
   */
  private *generateFromCompletion(
    task: Task,
    rangeStart: Date,
    rangeEnd: Date,
    ctx: FromCompletionContext,
  ): IterableIterator<VirtualInstance> {
    const t = task as any;
    if (!t.rrule) return;

    // Block if an instance is still RUNNING
    if (ctx.hasRunningInstance) return;

    const anchor = ctx.lastTerminalDate ?? new Date(task.startDate);
    const timezone = t.timezone || 'UTC';

    // If First Run (no history), we want the first valid occurrence >= startDate.
    // If History exists, we want the next valid occurrence AFTER history date.
    // The RecurrenceService will handle this distinction based on whether anchor is StartDate or LastTerminal.
    // Actually, logic is cleaner if we just ask: Next Occurrence relative to Anchor.
    // But for First Run: Anchor = StartDate.
    //    If StartDate matches RRule -> Return StartDate.
    //    If not -> Return Next.
    // For History: Anchor = LastTerminal.
    //    Return Next (strictly after).

    const isFirstRun = ctx.lastTerminalDate === null;

    const nextDate = this.recurrenceService.getNextFromCompletion(
      t.rrule,
      anchor,
      timezone,
      isFirstRun, // Pass context to decide inclusive/exclusive
    );

    if (!nextDate) return;
    if (isAfter(nextDate, rangeEnd) || isBefore(nextDate, rangeStart)) return;
    if (task.activeUntil && isAfter(nextDate, new Date(task.activeUntil)))
      return;

    let periodEnd = nextDate;
    if (task.dueOffset && task.dueOffset > 0) {
      periodEnd = addMinutes(nextDate, task.dueOffset);
    }

    yield {
      taskId: task.id,
      date: nextDate,
      originalDate: nextDate,
      periodicity: 'from_completion',
      periodStart: nextDate,
      periodEnd: periodEnd,
      rrule: t.rrule,
    };
  }
}

function getYearlyEndDate(endDate: Date | null, year: number): Date | null {
  if (!endDate) return null;
  const d = new Date(endDate);
  d.setFullYear(year);
  return endOfDay(d);
}
