import { http } from './http';
import type {
    User,
    CreateUserDto,
    CredentialsEmailStatus,
    GuestViewName,
    UpdateUserDto,
    PaginationParams,
} from './types';

/**
 * Users API module.
 */
export type OwnProfile = Pick<User, 'id' | 'username' | 'fullname' | 'email' | 'role' | 'avatarUrl'> & { mfaEnabled: boolean; mfaRequired: boolean };

export const usersApi = {
    getOwnProfile: () => http.get<OwnProfile>('/users/me/profile'),
    updateOwnProfile: (fullname: string) => http.patch<OwnProfile>('/users/me/profile', { fullname }),
    /**
     * Get all users (paginated).
     */
    getAll: (params?: PaginationParams & { includeDeleted?: boolean; manageable?: boolean }) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.includeDeleted) searchParams.set('includeDeleted', 'true');
        if (params?.manageable) searchParams.set('manageable', 'true');
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
        http.post<User & { credentialsEmail?: CredentialsEmailStatus }>('/users', dto),

    /**
     * Whether temporary credentials can be emailed (email enabled and configured).
     */
    emailAvailable: () =>
        http.get<{ available: boolean }>('/users/email-available'),

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
    resetPassword: (id: number, password: string, sendEmail?: boolean) =>
        http.post<{ ok: boolean; credentialsEmail?: CredentialsEmailStatus }>(`/users/${id}/reset-password`, { password, sendEmail }),

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
        /** Creates the TV accounts of a site: the board, the analytics, or both (the board when omitted). */
        create: (siteId: number, views?: GuestViewName[]) =>
            http.post<Array<User & { rawPassword?: string }>>(`/guests/site/${siteId}`, { views }),
        /** One-time login link for the TV screen (valid once, for a day). */
        createLink: (id: number) =>
            http.post<{ ticket: string; expiresAt: string }>(`/guests/${id}/link`),
        regeneratePassword: (id: number) =>
            http.patch<{ success: boolean; newPassword: string }>(`/guests/${id}/regenerate`),
        revoke: (id: number) =>
            http.delete<{ success: boolean }>(`/guests/${id}`),
    },
};
