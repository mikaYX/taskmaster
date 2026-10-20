import { z } from 'zod';

export const groupSchema = z.object({
    id: z.number(),
    name: z.string().min(2, 'groupMgmt.validation.nameMin2'),
    description: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
    userCount: z.number().optional(),
});

export const createGroupSchema = z.object({
    name: z.string().min(2, 'groupMgmt.validation.nameMin2').max(50),
    description: z.string().max(255).optional(),
});

export const updateGroupSchema = createGroupSchema.partial();
