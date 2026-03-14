import { http } from './http';
import type {
    User,
    CreateUserDto,
    UpdateUserDto,
    PaginationParams,
} from './types';

/**
 * Users API module.
 */
export const usersApi = {
    /**
     * Get all users (paginated).
     */
    getAll: (params?: PaginationParams & { includeDeleted?: boolean }) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.includeDeleted) searchParams.set('includeDeleted', 'true');
        const query = searchParams.toString();
        return http.get<User[]>(`/users${query ? `?${query}` : ''}`);
    },

    /**
     * Get user count.
     */
    count: () =>
        http.get<{ count: number }>('/users/count'),

    /**
     * Get user by ID.
     */
    getById: (id: number) =>
        http.get<User>(`/users/${id}`),

    /**
     * Create new user.
     */
    create: (dto: CreateUserDto) =>
        http.post<User>('/users', dto),

    /**
     * Update user.
     */
    update: (id: number, dto: UpdateUserDto) =>
        http.put<User>(`/users/${id}`, dto),

    /**
     * Soft delete user.
     */
    delete: (id: number) =>
        http.delete<void>(`/users/${id}`),

    /**
     * Restore soft-deleted user.
     */
    restore: (id: number) =>
        http.patch<User>(`/users/${id}/restore`),

    /**
     * Reset user password.
     */
    resetPassword: (id: number, password: string) =>
        http.post<{ ok: boolean }>(`/users/${id}/reset-password`, { password }),

    /**
     * Upload current user's avatar (authenticated user).
     */
    uploadMyAvatar: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        // Do not set Content-Type: the browser must set multipart/form-data with boundary
        return http.post<{ url: string }>('/users/me/avatar', formData);
    },

    /**
     * Guest TV Links API.
     */
    guests: {
        list: () =>
            http.get<User[]>('/guests'),
        findBySite: (siteId: number) =>
            http.get<User>(`/guests/site/${siteId}`),
        create: (siteId: number) =>
            http.post<User & { rawPassword?: string }>(`/guests/site/${siteId}`),
        regeneratePassword: (id: number) =>
            http.patch<{ success: boolean; newPassword: string }>(`/guests/${id}/regenerate`),
        revoke: (id: number) =>
            http.delete<{ success: boolean }>(`/guests/${id}`),
    },
};
