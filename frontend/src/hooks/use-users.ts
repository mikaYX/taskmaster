import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import type { CreateUserDto, UpdateUserDto } from '@/api/types';

export const userKeys = {
    all: ['users'] as const,
    lists: () => [...userKeys.all, 'list'] as const,
    list: (filters: string) => [...userKeys.lists(), { filters }] as const,
    details: () => [...userKeys.all, 'detail'] as const,
    detail: (id: number) => [...userKeys.details(), id] as const,
};

export function useUsers(includeDeleted = false) {
    return useQuery({
        queryKey: userKeys.list(includeDeleted ? 'all' : 'active'),
        queryFn: () => usersApi.getAll({ includeDeleted }),
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

    return useMutation({
        mutationFn: (file: File) => usersApi.uploadMyAvatar(file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
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
        mutationFn: (siteId: number) => usersApi.guests.create(siteId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.all });
        },
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
