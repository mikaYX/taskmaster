import {
  DEFAULT_REMIND_BEFORE_MINUTES,
  dueMoment,
  isReminderDue,
} from './todo-reminder-time';

describe('dueMoment', () => {
  const due = new Date('2026-10-20T00:00:00Z');

  it('reads the time of day in the application timezone', () => {
    // Paris is UTC+2 on that date.
    expect(dueMoment(due, '14:30', 'Europe/Paris').toISOString()).toBe(
      '2026-10-20T12:30:00.000Z',
    );
  });

  it('falls back to 09:00 when the todo has a date only', () => {
    expect(dueMoment(due, null, 'Europe/Paris').toISOString()).toBe(
      '2026-10-20T07:00:00.000Z',
    );
  });

  it('keeps the calendar day whatever the timezone offset', () => {
    expect(dueMoment(due, '23:00', 'America/New_York').toISOString()).toBe(
      '2026-10-21T03:00:00.000Z',
    );
  });
});

describe('isReminderDue', () => {
  const moment = new Date('2026-10-20T07:00:00Z');
  const at = (iso: string) => new Date(iso);

  it('waits for the default lead time of one day', () => {
    expect(isReminderDue(at('2026-10-19T06:59:00Z'), moment, null)).toBe(false);
    expect(isReminderDue(at('2026-10-19T07:00:00Z'), moment, null)).toBe(true);
    expect(DEFAULT_REMIND_BEFORE_MINUTES).toBe(1440);
  });

  it('honours a custom lead time, down to "when it is due"', () => {
    expect(isReminderDue(at('2026-10-20T06:00:00Z'), moment, 60)).toBe(true);
    expect(isReminderDue(at('2026-10-20T05:59:00Z'), moment, 60)).toBe(false);
    expect(isReminderDue(at('2026-10-20T07:00:00Z'), moment, 0)).toBe(true);
    expect(isReminderDue(at('2026-10-20T06:59:00Z'), moment, 0)).toBe(false);
  });

  it('still reminds for a day after the due moment, then gives up', () => {
    expect(isReminderDue(at('2026-10-21T06:59:00Z'), moment, null)).toBe(true);
    expect(isReminderDue(at('2026-10-21T07:00:00Z'), moment, null)).toBe(false);
  });
});
