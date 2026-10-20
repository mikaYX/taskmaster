import i18n from '@/lib/i18n';
import { getDateLocale } from '@/lib/date-locale';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Due dates are stored as UTC midnight of the chosen day, so compare calendar days in UTC. */
const utcDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Whole calendar days from today to the due date: negative when late. */
export const daysUntilDue = (dueDate: string, now: Date = new Date()) =>
    Math.round((utcDay(new Date(dueDate)) - utcDay(now)) / DAY_MS);

export interface DueInfo {
    label: string;
    overdue: boolean;
}

/**
 * "Today", "Tomorrow", "Late by 2 d" or a short date for anything further away, in the
 * app language, followed by the time of day when the todo has one.
 */
export function describeDue(dueDate: string, now: Date = new Date(), dueTime?: string | null): DueInfo {
    const days = daysUntilDue(dueDate, now);
    const at = dueTime ? ` ${dueTime}` : '';
    if (days < 0) return { label: i18n.t('todos.due.lateByDays', { n: -days }), overdue: true };
    if (days === 0) return { label: `${i18n.t('todos.due.today')}${at}`, overdue: false };
    if (days === 1) return { label: `${i18n.t('todos.due.tomorrow')}${at}`, overdue: false };
    if (days < 7) return { label: `${i18n.t('todos.due.inDays', { n: days })}${at}`, overdue: false };
    return {
        label:
            new Date(dueDate).toLocaleDateString(getDateLocale().code, {
                day: 'numeric',
                month: 'short',
                timeZone: 'UTC',
            }) + at,
        overdue: false,
    };
}
