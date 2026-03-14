import { z } from 'zod';

export const userSchema = z.object({
    id: z.number(),
    username: z.string().min(3, 'Username must be at least 3 characters'),
    email: z.string().email('Invalid email address').optional(),
    fullname: z.string().optional(),
    role: z.enum(['ADMIN', 'USER', 'GUEST']),
    createdAt: z.string(),
    updatedAt: z.string(),
    lastLoginAt: z.string().optional(),
});

export const createUserSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters').max(50),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    fullname: z.string().max(100).optional(),
    role: z.enum(['ADMIN', 'USER', 'GUEST']).default('USER'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const updateUserSchema = createUserSchema.partial().omit({ password: true });

export const resetPasswordSchema = z.object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
});
