import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupsApi } from '@/api/groups';
import type { CreateGroupDto, UpdateGroupDto, GroupMembersDto } from '@/api/types';

export const groupKeys = {
    all: ['groups'] as const,
    lists: () => [...groupKeys.all, 'list'] as const,
    list: (filters: string) => [...groupKeys.lists(), { filters }] as const,
    details: () => [...groupKeys.all, 'detail'] as const,
    detail: (id: number) => [...groupKeys.details(), id] as const,
    members: (id: number) => [...groupKeys.detail(id), 'members'] as const,
};

export function useGroups() {
    return useQuery({
        queryKey: groupKeys.lists(),
        queryFn: () => groupsApi.getAll(),
    });
}

export function useGroup(id: number) {
    return useQuery({
        queryKey: groupKeys.detail(id),
        queryFn: () => groupsApi.getById(id),
        enabled: !!id,
    });
}

export function useCreateGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateGroupDto) => groupsApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
        },
    });
}

export function useUpdateGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: UpdateGroupDto }) =>
            groupsApi.update(id, dto),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
            queryClient.invalidateQueries({ queryKey: groupKeys.detail(data.id) });
        },
    });
}

export function useDeleteGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => groupsApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
        },
    });
}

export function useGroupMembers(groupId: number) {
    return useQuery({
        queryKey: groupKeys.members(groupId),
        queryFn: () => groupsApi.getMembers(groupId),
        enabled: !!groupId,
    });
}

export function useAddGroupMembers() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: GroupMembersDto }) =>
            groupsApi.addMembers(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: groupKeys.members(id) });
        },
    });
}

export function useRemoveGroupMembers() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: GroupMembersDto }) =>
            groupsApi.removeMembers(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: groupKeys.members(id) });
        },
    });
}
