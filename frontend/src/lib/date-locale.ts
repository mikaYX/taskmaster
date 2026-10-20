import { enUS, fr } from 'date-fns/locale';
import type { Locale } from 'date-fns';
import i18n from '@/lib/i18n';

/** date-fns locale matching the language chosen in the app (English by default). */
export function getDateLocale(): Locale {
    return i18n.language?.startsWith('fr') ? fr : enUS;
}

/**
 * "1st", "2nd"... in English; "1er", then the bare number, in French
 * (used in "the 15th day of every month" style sentences).
 */
export function formatDayOrdinal(day: number): string {
    if (i18n.language?.startsWith('fr')) return day === 1 ? '1er' : String(day);
    if (day % 10 === 1 && day % 100 !== 11) return `${day}st`;
    if (day % 10 === 2 && day % 100 !== 12) return `${day}nd`;
    if (day % 10 === 3 && day % 100 !== 13) return `${day}rd`;
    return `${day}th`;
}
