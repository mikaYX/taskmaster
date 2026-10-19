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

/** "Aujourd'hui", "Demain", "En retard de 2 j" or a short date for anything further away. */
export function describeDue(dueDate: string, now: Date = new Date()): DueInfo {
    const days = daysUntilDue(dueDate, now);
    if (days < 0) return { label: `En retard de ${-days} j`, overdue: true };
    if (days === 0) return { label: "Aujourd'hui", overdue: false };
    if (days === 1) return { label: 'Demain', overdue: false };
    if (days < 7) return { label: `Dans ${days} j`, overdue: false };
    return {
        label: new Date(dueDate).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' }),
        overdue: false,
    };
}
