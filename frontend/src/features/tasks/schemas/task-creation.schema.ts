import { z } from 'zod';
import { validateTaskDate } from '@/utils/task-date-validation';

export const periodicityEnum = z.enum(['daily', 'weekly', 'monthly', 'yearly', 'custom']);
export const priorityEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const notificationsSchema = z.object({
    channelId: z.number(),
    notifyOnFailed: z.boolean(),
    notifyOnMissing: z.boolean(),
    notifyOnReminder: z.boolean(),
    emailUserIds: z.array(z.number()).optional(),
    emailGroupIds: z.array(z.number()).optional(),
    emailCustom: z.array(z.string().email("Invalid email")).optional(),
});

const baseSchema = z.object({
    name: z.string().min(3, "Name must be at least 3 characters").max(50, "Name must be less than 50 characters"),
    description: z.string().min(5, "Description must be at least 5 characters"),
    priority: priorityEnum.default('MEDIUM'),
    procedureMode: z.enum(['URL', 'UPLOAD']).default('URL'),
    procedureUrl: z.string().url("Must be a valid URL").optional().or(z.literal('')),
    procedureFile: z.custom<File>((val) => val instanceof File || val === undefined, "Expected a File").optional(),
    // Periodicity is handled by discriminated union below
    timezone: z.string().optional().refine((val) => {
        if (!val) return true;
        try {
            Intl.DateTimeFormat(undefined, { timeZone: val });
            return true;
        } catch {
            return false;
        }
    }, { message: "Invalid Timezone" }),
    dueOffset: z.number().min(0).optional(),

    interval: z.number().min(1).default(1),
    byWeekday: z.array(z.number().min(0).max(6)).optional(),
    bySetPos: z.number().min(-1).max(4).optional(),
    byMonthDay: z.number().min(1).max(31).optional(),
    customFreq: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(), // Legacy support
    customRuleType: z.enum(['every_x_days', 'selected_weekdays', 'weeks_of_month', 'days_of_year']).optional(),
    byYearDay: z.array(z.number().min(1).max(366)).optional(),
    isContinuousBlock: z.boolean().default(false).optional(),

    recurrenceMode: z.enum(['ON_SCHEDULE', 'FROM_COMPLETION']).optional().default('ON_SCHEDULE'),

    useGlobalWindowDefaults: z.boolean().default(true),
    windowStartTime: z.string().nullable().optional(),
    windowEndTime: z.string().nullable().optional(),
    notifications: z.array(notificationsSchema).optional(),
});

const schedulingSchema = z.object({
    startDate: z.date(),
    skipWeekends: z.boolean().default(false),
    skipHolidays: z.boolean().default(false),
});

const assignmentsSchema = z.object({
    userIds: z.array(z.number()).default([]),
    groupIds: z.array(z.number()).default([]),
});

interface V2SchedulingData {
    useGlobalWindowDefaults?: boolean;
    windowStartTime?: string | null;
    windowEndTime?: string | null;
}

const v2SchedulingRefinement = (data: V2SchedulingData, ctx: z.RefinementCtx) => {
    if (data.useGlobalWindowDefaults === false) {
        if (!data.windowStartTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Start time is required when overriding global defaults",
                path: ["windowStartTime"],
            });
        } else if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(data.windowStartTime)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid time format (HH:mm)",
                path: ["windowStartTime"],
            });
        }

        if (!data.windowEndTime) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "End time is required when overriding global defaults",
                path: ["windowEndTime"],
            });
        } else if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(data.windowEndTime)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Invalid time format (HH:mm)",
                path: ["windowEndTime"],
            });
        }
    }
};

export const createTaskSchema = z.discriminatedUnion('periodicity', [
    baseSchema.extend({
        periodicity: z.literal('daily'),
        ...schedulingSchema.shape,
        ...assignmentsSchema.shape
    }).superRefine(v2SchedulingRefinement),
    baseSchema.extend({
        periodicity: z.literal('weekly'),
        ...schedulingSchema.shape,
        ...assignmentsSchema.shape
    }).superRefine(v2SchedulingRefinement),
    baseSchema.extend({
        periodicity: z.literal('monthly'),
        ...schedulingSchema.shape,
        ...assignmentsSchema.shape
    }).superRefine(v2SchedulingRefinement),
    baseSchema.extend({
        periodicity: z.literal('yearly'),
        ...schedulingSchema.shape,
        endDate: z.date(),
        ...assignmentsSchema.shape
    }).superRefine(v2SchedulingRefinement),
    baseSchema.extend({
        periodicity: z.literal('custom'),
        customRuleType: z.enum(['every_x_days', 'selected_weekdays', 'weeks_of_month', 'days_of_year']),
        ...schedulingSchema.shape,
        ...assignmentsSchema.shape
    }).superRefine(v2SchedulingRefinement).superRefine((data, ctx) => {
        if (data.customRuleType === 'every_x_days') {
            if (!data.interval || data.interval < 1) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Interval must be >= 1", path: ["interval"] });
            }
        } else if (data.customRuleType === 'selected_weekdays') {
            if (!data.byWeekday || data.byWeekday.length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one weekday", path: ["byWeekday"] });
            }
        } else if (data.customRuleType === 'weeks_of_month') {
            if (data.bySetPos === undefined || data.bySetPos === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a week position (e.g., First, Last)", path: ["bySetPos"] });
            }
            if (!data.byWeekday || data.byWeekday.length === 0) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one weekday", path: ["byWeekday"] });
            }
        } else if (data.customRuleType === 'days_of_year') {
            if (!data.byYearDay || data.byYearDay.length === 0 || data.byYearDay.some(d => d < 1 || d > 366)) {
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Provide at least one valid day of year (1-366)", path: ["byYearDay"] });
            }
        }
    }),
]).superRefine((data, ctx) => {
    if (data.startDate) {
        const startResult = validateTaskDate(data.periodicity, data.startDate, 'startDate');
        if (!startResult.isValid) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: startResult.errorMessage,
                path: ["startDate"],
            });
        }
    }

    // In this schema, `endDate` is used dynamically for yearly tasks (or it could be optional for others depending on form usage)
    if ('endDate' in data && data.endDate) {
        const endResult = validateTaskDate(data.periodicity, data.endDate as Date, 'endDate');
        if (!endResult.isValid) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: endResult.errorMessage,
                path: ["endDate"],
            });
        }
    }
});

export type CreateTaskFormValues = z.infer<typeof createTaskSchema>;

