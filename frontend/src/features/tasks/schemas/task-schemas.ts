import { z } from 'zod';

export const dayOfWeekSchema = z.enum([
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
]);

export const taskSchema = z.object({
    id: z.number(),
    name: z.string().min(3, 'Task name must be at least 3 characters'),
    description: z.string().optional(),
    scheduledTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
    daysOfWeek: z.array(dayOfWeekSchema).min(1, 'Select at least one day'),
    isActive: z.boolean(),
    assignedUserIds: z.array(z.number()),
    assignedGroupIds: z.array(z.number()),
});

export const createTaskSchema = z.object({
    name: z.string().min(3, 'Task name must be at least 3 characters').max(100),
    description: z.string().max(500).optional(),
    scheduledTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
    daysOfWeek: z.array(dayOfWeekSchema).min(1, 'Select at least one day'),
    isActive: z.boolean().default(true),
    assignedUserIds: z.array(z.number()).default([]),
    assignedGroupIds: z.array(z.number()).default([]),
});

export const updateTaskSchema = createTaskSchema.partial();
