import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/stores/auth-store';
import type { CreateUserDto, GuestViewName, UpdateUserDto } from '@/api/types';

export const userKeys = {
    all: ['users'] as const,
    lists: () => [...userKeys.all, 'list'] as const,
    list: (filters: string) => [...userKeys.lists(), { filters }] as const,
    details: () => [...userKeys.all, 'detail'] as const,
    detail: (id: number) => [...userKeys.details(), id] as const,
};

export function useOwnProfile() {
    const userId = useAuthStore(state => state.userId);
    const role = useAuthStore(state => state.role);
    return useQuery({ queryKey: ['own-profile', userId, role], queryFn: usersApi.getOwnProfile, enabled: !!userId && role !== 'GUEST' });
}

/**
 * `manageable` restricts the list to the accounts the caller may administer
 * (a manager only gets USER/MANAGER accounts of their own sites). The default
 * list stays complete because task assignment and groups rely on it.
 */
export function useUsers(includeDeleted = false, manageable = false, enabled = true) {
    return useQuery({
        enabled,
        queryKey: userKeys.list(`${includeDeleted ? 'all' : 'active'}${manageable ? '-manageable' : ''}`),
        queryFn: () => usersApi.getAll({ includeDeleted, manageable }),
    });
}

export function useCreateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateUserDto) => usersApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

/** Whether credentials can be emailed; false while loading or when unknown. */
export function useCredentialsEmailAvailable(enabled: boolean) {
    return useQuery({
        queryKey: [...userKeys.all, 'email-available'],
        queryFn: () => usersApi.emailAvailable(),
        enabled,
        staleTime: 30 * 1000,
        retry: false,
    });
}

export function useUpdateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: UpdateUserDto }) =>
            usersApi.update(id, dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

export function useUploadMyAvatar() {
    const queryClient = useQueryClient();
    const userId = useAuthStore(state => state.userId);

    return useMutation({
        mutationFn: (file: File) => usersApi.uploadMyAvatar(file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
            queryClient.invalidateQueries({ queryKey: ['own-profile', userId] });
        },
    });
}

export function useDeleteUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => usersApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

export function useRestoreUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => usersApi.restore(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

/**
 * Guest TV Links Hooks.
 */

export function useGuests() {
    return useQuery({
        queryKey: [...userKeys.all, 'guests'],
        queryFn: () => usersApi.guests.list(),
    });
}

export function useCreateGuest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ siteId, views }: { siteId: number; views?: GuestViewName[] }) =>
            usersApi.guests.create(siteId, views),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.all });
        },
    });
}

export function useCreateGuestLink() {
    return useMutation({
        mutationFn: (id: number) => usersApi.guests.createLink(id),
    });
}

export function useRegenerateGuestPassword() {
    return useMutation({
        mutationFn: (id: number) => usersApi.guests.regeneratePassword(id),
    });
}

export function useRevokeGuest() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => usersApi.guests.revoke(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.all });
        },
    });
}
