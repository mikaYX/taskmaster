import { TodoRecurrence } from '@prisma/client';

const DAY_MS = 24 * 60 * 60 * 1000;

const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Same day-of-month `months` later, clamped to the end of a shorter month. */
function addMonths(base: Date, months: number): Date {
  const target = new Date(
    Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + months, 1),
  );
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(base.getUTCDate(), lastDay));
  return target;
}

/**
 * Due date of the next occurrence of a recurring todo: the first step after
 * `due` that is not in the past, so a todo ticked weeks late does not come
 * back already overdue. Steps are counted from the original date (no drift
 * on the 31st). Without a due date, the cycle starts from today.
 */
export function nextDueDate(
  due: Date | null,
  recurrence: TodoRecurrence,
  now: Date = new Date(),
): Date {
  const today = startOfUtcDay(now);
  const base = startOfUtcDay(due ?? today);

  for (let k = 1; k <= 1000; k++) {
    let candidate: Date;
    if (recurrence === TodoRecurrence.DAILY) {
      candidate = new Date(base.getTime() + k * DAY_MS);
    } else if (recurrence === TodoRecurrence.WEEKLY) {
      candidate = new Date(base.getTime() + k * 7 * DAY_MS);
    } else {
      candidate = addMonths(base, k);
    }
    if (candidate.getTime() >= today.getTime()) return candidate;
  }
  return today;
}
