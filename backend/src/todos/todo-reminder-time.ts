import { fromZonedTime } from 'date-fns-tz';

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a todo has a date but no time, it is due at this hour. */
export const DEFAULT_DUE_TIME = '09:00';

/** One day, expressed in minutes: the default lead time of a reminder. */
export const DEFAULT_REMIND_BEFORE_MINUTES = 24 * 60;

/** Longest lead time a person can choose (a week). */
export const MAX_REMIND_BEFORE_MINUTES = 7 * 24 * 60;

/**
 * The instant a todo is due. `dueDate` is stored as UTC midnight of the chosen
 * calendar day; the time of day is read in the application's timezone.
 */
export function dueMoment(
  dueDate: Date,
  dueTime: string | null | undefined,
  timeZone: string,
): Date {
  const day = dueDate.toISOString().slice(0, 10);
  return fromZonedTime(`${day}T${dueTime || DEFAULT_DUE_TIME}:00`, timeZone);
}

/**
 * Whether a reminder should go out now: from the chosen lead time before the due
 * moment until a day after it (a todo that became overdue unnoticed still gets
 * its reminder, once).
 */
export function isReminderDue(
  now: Date,
  due: Date,
  remindBeforeMinutes: number | null | undefined,
): boolean {
  const lead = (remindBeforeMinutes ?? DEFAULT_REMIND_BEFORE_MINUTES) * 60_000;
  return (
    now.getTime() >= due.getTime() - lead &&
    now.getTime() < due.getTime() + DAY_MS
  );
}
