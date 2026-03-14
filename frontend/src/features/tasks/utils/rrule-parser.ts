import { RRule } from 'rrule';
import type { CreateTaskFormValues } from '../schemas/task-creation.schema';

/**
 * Parses an RRule string and returns partial form values (interval, byDay, etc.)
 * to pre-fill the Task Form in Edit mode.
 */
export const parseRRuleToForm = (rruleString: string | null | undefined): Partial<CreateTaskFormValues> => {
    if (!rruleString) return {};

    try {
        const options = RRule.parseString(rruleString);

        const formValues: Partial<CreateTaskFormValues> = {};

        // Map Frequency
        switch (options.freq) {
            case RRule.DAILY:
                formValues.periodicity = 'daily';
                break;
            case RRule.WEEKLY:
                formValues.periodicity = 'weekly';
                break;
            case RRule.MONTHLY:
                formValues.periodicity = 'monthly';
                break;
            case RRule.YEARLY:
                formValues.periodicity = 'yearly';
                break;
            default:
                // Unsupported frequency or complex
                return {};
        }

        // Map Interval
        if (options.interval) {
            formValues.interval = options.interval;
        }

        // Helper to normalize to array
        const toArray = <T>(val: T | T[] | null | undefined): T[] => {
            if (val === null || val === undefined) return [];
            return Array.isArray(val) ? val : [val];
        };

        // Map ByWeekday (Weekly)
        const byWeekday = toArray(options.byweekday);
        if (byWeekday.length > 0) {
            formValues.byWeekday = byWeekday.map((w: any) => {
                // Check if w has .weekday (it might be a Weekday object)
                if (w && typeof w === 'object' && 'weekday' in w) {
                    return w.weekday;
                }
                if (typeof w === 'number') return w;
                return w.weekday; // Fallback
            });
        }

        // Map BySetPos (Monthly Nth)
        const bySetPos = toArray(options.bysetpos);
        if (bySetPos.length > 0) {
            formValues.bySetPos = bySetPos[0];
        } else if (byWeekday.length === 1) {
            // Check if the single weekday has .n property (e.g. 3FR)
            const w: any = byWeekday[0];
            if (w && typeof w === 'object' && w.n) {
                formValues.bySetPos = w.n;
            }
        }

        // Map ByMonthDay
        const byMonthDay = toArray(options.bymonthday);
        if (byMonthDay.length > 0) {
            formValues.byMonthDay = byMonthDay[0];
        }

        return formValues;

    } catch (e) {
        console.warn("Failed to parse RRule string", e);
        return {};
    }
};
