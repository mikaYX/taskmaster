import type { TodoPriority } from '@/api/todos';

/**
 * Quick add: type "Appeler le fournisseur @demain @14h30 !urgent" and the date, the
 * time and the priority are read from the sentence. Words work in French and English.
 *
 *   !basse !normale !haute !urgente      (!low !normal !high !urgent)
 *   @aujourd'hui @demain @lundi ...      (@today @tomorrow @monday ...)
 *   @+3j @+2s                            (in 3 days, in 2 weeks: @+3d @+2w)
 *   @2026-11-02 @02/11 @02/11/2026
 *   @14h30 @9h @14:30
 *
 * Anything that is not recognised stays in the title.
 */
export interface QuickAdd {
    title: string;
    priority?: TodoPriority;
    /** YYYY-MM-DD */
    dueDate?: string;
    /** HH:mm */
    dueTime?: string;
}

const PRIORITIES: Record<string, TodoPriority> = {
    basse: 'LOW',
    low: 'LOW',
    normale: 'NORMAL',
    normal: 'NORMAL',
    haute: 'HIGH',
    high: 'HIGH',
    urgente: 'URGENT',
    urgent: 'URGENT',
};

/** Index = JavaScript's Date#getDay (Sunday first). */
const WEEKDAYS: string[][] = [
    ['dimanche', 'dim', 'sunday', 'sun'],
    ['lundi', 'lun', 'monday', 'mon'],
    ['mardi', 'mar', 'tuesday', 'tue'],
    ['mercredi', 'mer', 'wednesday', 'wed'],
    ['jeudi', 'jeu', 'thursday', 'thu'],
    ['vendredi', 'ven', 'friday', 'fri'],
    ['samedi', 'sam', 'saturday', 'sat'],
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, days: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** A real calendar date, so 31/02 is not silently turned into March. */
function validDate(year: number, month: number, day: number): Date | null {
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day ? d : null;
}

function readDate(token: string, today: Date): Date | null {
    const word = token.toLowerCase();
    if (word === "aujourd'hui" || word === 'aujourdhui' || word === 'today') return today;
    if (word === 'demain' || word === 'tomorrow') return addDays(today, 1);

    const relative = /^\+(\d{1,3})([jdsw])$/.exec(word);
    if (relative) {
        const count = Number(relative[1]);
        return addDays(today, relative[2] === 's' || relative[2] === 'w' ? count * 7 : count);
    }

    const weekday = WEEKDAYS.findIndex((names) => names.includes(word));
    if (weekday !== -1) {
        // The next one: "@lundi" on a Monday means next week.
        const ahead = ((weekday - today.getDay() + 6) % 7) + 1;
        return addDays(today, ahead);
    }

    const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(word);
    if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    const short = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(word);
    if (short) {
        const day = Number(short[1]);
        const month = Number(short[2]);
        if (short[3]) return validDate(Number(short[3]), month, day);
        // No year: the next time that day comes.
        const thisYear = validDate(today.getFullYear(), month, day);
        if (thisYear && thisYear >= today) return thisYear;
        return validDate(today.getFullYear() + 1, month, day);
    }
    return null;
}

function readTime(token: string): string | null {
    const match = /^(\d{1,2})(?:[h:](\d{2})?)$/i.exec(token);
    if (!match || (!token.includes('h') && !token.includes(':') && !token.includes('H'))) return null;
    const hours = Number(match[1]);
    const minutes = match[2] ? Number(match[2]) : 0;
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
}

export function parseQuickAdd(input: string, now: Date = new Date()): QuickAdd {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const result: QuickAdd = { title: '' };
    const kept: string[] = [];

    for (const word of input.trim().split(/\s+/)) {
        if (word.startsWith('!') && word.length > 1) {
            const priority = PRIORITIES[word.slice(1).toLowerCase()];
            if (priority) {
                result.priority = priority;
                continue;
            }
        }
        if (word.startsWith('@') && word.length > 1) {
            const token = word.slice(1);
            const time = readTime(token);
            if (time) {
                result.dueTime = time;
                continue;
            }
            const date = readDate(token, today);
            if (date) {
                result.dueDate = toIso(date);
                continue;
            }
        }
        kept.push(word);
    }

    result.title = kept.join(' ').trim();
    return result;
}
