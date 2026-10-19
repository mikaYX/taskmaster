import { TodoRecurrence } from '@prisma/client';
import { nextDueDate } from './todo-recurrence';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const now = new Date('2026-10-19T09:30:00Z');

describe('nextDueDate', () => {
  it('moves a daily todo to the next day', () => {
    expect(
      iso(nextDueDate(new Date('2026-10-19'), TodoRecurrence.DAILY, now)),
    ).toBe('2026-10-20');
  });

  it('moves a weekly todo by seven days', () => {
    expect(
      iso(nextDueDate(new Date('2026-10-19'), TodoRecurrence.WEEKLY, now)),
    ).toBe('2026-10-26');
  });

  it('skips occurrences already in the past', () => {
    expect(
      iso(nextDueDate(new Date('2026-10-01'), TodoRecurrence.WEEKLY, now)),
    ).toBe('2026-10-22');
  });

  it('clamps a monthly todo to the end of a short month', () => {
    expect(
      iso(
        nextDueDate(
          new Date('2026-01-31'),
          TodoRecurrence.MONTHLY,
          new Date('2026-01-31T08:00:00Z'),
        ),
      ),
    ).toBe('2026-02-28');
  });

  it('does not drift after a short month', () => {
    expect(
      iso(
        nextDueDate(
          new Date('2026-01-31'),
          TodoRecurrence.MONTHLY,
          new Date('2026-03-01T08:00:00Z'),
        ),
      ),
    ).toBe('2026-03-31');
  });

  it('starts from today when there is no due date', () => {
    expect(iso(nextDueDate(null, TodoRecurrence.DAILY, now))).toBe(
      '2026-10-20',
    );
  });
});
