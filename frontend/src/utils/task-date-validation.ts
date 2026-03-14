import { startOfDay, startOfWeek, startOfMonth, startOfYear, subWeeks, subMonths, subYears, format } from 'date-fns';

export type TaskRecurrence = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY' | 'CUSTOM' | 'CRON' | 'ONCE';

export interface DateValidationResult {
    isValid: boolean;
    errorMessage?: string;
    minDate?: Date;
}

export function validateTaskDate(
    recurrence: TaskRecurrence | string,
    date: Date | string | null | undefined,
    field: 'startDate' | 'dueDate' | 'endDate'
): DateValidationResult {
    if (!date) return { isValid: true };

    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const today = startOfDay(now);
    const normalizedRecurrence = recurrence.toUpperCase();
    const targetField = field === 'dueDate' || field === 'endDate' ? 'endDate' : 'startDate';

    switch (normalizedRecurrence) {
        case 'DAILY':
            if (targetField === 'startDate' && dateObj < today) {
                return {
                    isValid: false,
                    errorMessage: `Daily tasks must start today or later (min: ${format(today, 'yyyy-MM-dd')})`,
                    minDate: today,
                };
            }
            break;

        case 'WEEKLY':
            if (targetField === 'endDate') {
                const previousWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 });
                if (dateObj < previousWeekStart) {
                    return {
                        isValid: false,
                        errorMessage: `Weekly tasks cannot be due before ${format(previousWeekStart, 'yyyy-MM-dd')}`,
                        minDate: previousWeekStart,
                    };
                }
            }
            break;

        case 'MONTHLY':
            if (targetField === 'endDate') {
                const previousMonthStart = startOfMonth(subMonths(now, 1));
                if (dateObj < previousMonthStart) {
                    return {
                        isValid: false,
                        errorMessage: `Monthly tasks cannot be due before ${format(previousMonthStart, 'yyyy-MM-dd')}`,
                        minDate: previousMonthStart,
                    };
                }
            }
            break;

        case 'YEARLY':
            if (targetField === 'endDate') {
                const previousYearStart = startOfYear(subYears(now, 1));
                if (dateObj < previousYearStart) {
                    return {
                        isValid: false,
                        errorMessage: `Yearly tasks cannot be due before ${format(previousYearStart, 'yyyy-MM-dd')}`,
                        minDate: previousYearStart,
                    };
                }
            }
            break;

        case 'CUSTOM':
        case 'CRON':
            if (targetField === 'endDate' && dateObj < today) {
                return {
                    isValid: false,
                    errorMessage: `Due date cannot be in the past (min: ${format(today, 'yyyy-MM-dd')})`,
                    minDate: today,
                };
            }
            break;
    }

    return { isValid: true };
}

export function getMinDateForRecurrence(recurrence: TaskRecurrence | string, field: 'startDate' | 'dueDate' | 'endDate'): Date {
    const now = new Date();
    const normalizedRecurrence = recurrence.toUpperCase();
    const targetField = field === 'dueDate' || field === 'endDate' ? 'endDate' : 'startDate';

    switch (normalizedRecurrence) {
        case 'DAILY':
            return startOfDay(now);
        case 'WEEKLY':
            return targetField === 'endDate' ? startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }) : startOfDay(now);
        case 'MONTHLY':
            return targetField === 'endDate' ? startOfMonth(subMonths(now, 1)) : startOfDay(now);
        case 'YEARLY':
            return targetField === 'endDate' ? startOfYear(subYears(now, 1)) : startOfDay(now);
        case 'CUSTOM':
        case 'CRON':
            return startOfDay(now);
        default:
            return startOfDay(now);
    }
}
