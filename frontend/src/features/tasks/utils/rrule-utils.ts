import { RRule } from 'rrule';
import type { CreateTaskFormValues } from '../schemas/task-creation.schema';

/**
 * Generates an RRule string from the Task Wizard form values.
 * Used when RRule V2 is enabled to provide a standard recurrence pattern.
 */
export const generateRRuleFromForm = (values: Partial<CreateTaskFormValues>): string | undefined => {
    if (!values.startDate) return undefined;

    const start = new Date(values.startDate);
    // RRule expects UTC or local based on options. We usually generate a string without DTSTART for simple patterns
    // or let the backend handle the anchor. 
    // However, the requirement is to generate standard RRule strings for the V2 engine.

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const options: Partial<any> = {
        dtstart: start,
    };

    const WEEKDAYS = [
        RRule.MO, RRule.TU, RRule.WE, RRule.TH, RRule.FR, RRule.SA, RRule.SU
    ];

    switch (values.periodicity) {
        case 'daily':
            options.freq = RRule.DAILY;
            options.interval = values.interval || 1;
            break;
        case 'weekly':
            options.freq = RRule.WEEKLY;
            options.interval = values.interval || 1;
            if (values.byWeekday && values.byWeekday.length > 0) {
                // Map numbers 0-6 (Mon-Sun) to RRule.Weekday
                options.byweekday = values.byWeekday.map(d => WEEKDAYS[d]).filter(Boolean);
            }
            break;
        case 'monthly':
            options.freq = RRule.MONTHLY;
            options.interval = values.interval || 1;

            if (values.bySetPos !== undefined && values.bySetPos !== 0 && values.byWeekday && values.byWeekday.length > 0) {
                // "Nth Weekday" pattern (e.g. 3rd Friday)
                options.bysetpos = values.bySetPos;
                // Only one day usually for this pattern
                options.byweekday = values.byWeekday.slice(0, 1).map(d => WEEKDAYS[d]).filter(Boolean);
            } else {
                // Standard "Day X of month"
                options.bymonthday = values.byMonthDay || start.getDate();
            }
            break;
        case 'yearly':
            options.freq = RRule.YEARLY;
            options.interval = values.interval || 1;
            break;
        case 'custom':
            if (values.customRuleType === 'every_x_days') {
                options.freq = RRule.DAILY;
            } else if (values.customRuleType === 'selected_weekdays') {
                options.freq = RRule.WEEKLY;
            } else if (values.customRuleType === 'weeks_of_month') {
                options.freq = RRule.MONTHLY;
            } else if (values.customRuleType === 'days_of_year') {
                options.freq = RRule.YEARLY;
            } else {
                options.freq = RRule[(values.customFreq?.toUpperCase() as keyof typeof RRule)] || RRule.DAILY; // Legacy fallback
            }
            options.interval = values.interval || 1;
            if (values.byWeekday && values.byWeekday.length > 0) {
                const isContinuous = values.isContinuousBlock && (values.customRuleType === 'selected_weekdays' || values.customRuleType === 'weeks_of_month');
                const effectiveWeekdays = isContinuous ? values.byWeekday.slice(0, 1) : values.byWeekday;
                options.byweekday = effectiveWeekdays.map((d: number) => WEEKDAYS[d]).filter(Boolean);
            }
            if (values.byMonthDay) {
                options.bymonthday = values.byMonthDay;
            }
            if (values.byYearDay && values.byYearDay.length > 0) {
                options.byyearday = values.byYearDay;
            }
            if (values.bySetPos) {
                options.bysetpos = values.bySetPos;
            }
            break;
        default:
            return undefined;
    }

    try {
        const rule = new RRule(options);
        // We only want the RRULE part, not DTSTART if we send startDate separately
        // But backend V2 might want the full string.
        // Let's send the full string including DTSTART for completeness as V2 engine uses it for calculation?
        // Actually, backend V2 `generateRRule` usually constructs it. 
        // User Requirement: "Générer/envoyer rrule depuis la périodicité existante... pour activer réellement le chemin V2 backend."
        return rule.toString();
    } catch (e) {
        console.error("Failed to generate RRule", e);
        return undefined;
    }
};
