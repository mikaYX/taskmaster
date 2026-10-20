import { z } from 'zod';

export const userSchema = z.object({
    id: z.number(),
    username: z.string().min(3, 'userMgmt.validation.usernameMin'),
    email: z.string().email('userMgmt.validation.invalidEmail').optional(),
    fullname: z.string().optional(),
    role: z.enum(['ADMIN', 'USER', 'GUEST']),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastLoginAt: z.string().optional(),
});

export const createUserSchema = z.object({
    username: z.string().min(3, 'userMgmt.validation.usernameMin').max(50),
    email: z.string().email('userMgmt.validation.invalidEmail').optional().or(z.literal('')),
    fullname: z.string().max(100).optional(),
    role: z.enum(['ADMIN', 'USER', 'GUEST']).default('USER'),
    password: z.string().min(8, 'userMgmt.validation.passwordMin'),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export const resetPasswordSchema = z.object({
    password: z.string().min(8, 'userMgmt.validation.passwordMin'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: 'userMgmt.validation.passwordsMismatch',
    path: ["confirmPassword"],
});
