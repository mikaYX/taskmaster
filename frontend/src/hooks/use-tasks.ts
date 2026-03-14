import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/tasks';
import type { CreateTaskDto, UpdateTaskDto, TaskAssignmentDto, CreateDelegationDto, UpdateDelegationDto } from '@/api/types';

export const taskKeys = {
    all: ['tasks'] as const,
    lists: () => [...taskKeys.all, 'list'] as const,
    list: (filters: Record<string, unknown>) => [...taskKeys.lists(), { filters }] as const,
    details: () => [...taskKeys.all, 'detail'] as const,
    detail: (id: number) => [...taskKeys.details(), id] as const,
    delegations: (id: number) => [...taskKeys.detail(id), 'delegations'] as const,
};

export function useTasks(includeInactive = false, filterUserId?: number, filterGroupId?: number) {
    return useQuery({
        queryKey: taskKeys.list({ includeInactive, filterUserId, filterGroupId }),
        queryFn: () => tasksApi.getAll({ includeInactive, filterUserId, filterGroupId }),
    });
}

export function useTask(id: number) {
    return useQuery({
        queryKey: taskKeys.detail(id),
        queryFn: () => tasksApi.getById(id),
        enabled: !!id,
    });
}

export function useCreateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateTaskDto) => tasksApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

export function useUpdateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: UpdateTaskDto }) =>
            tasksApi.update(id, dto),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(data.id) });
        },
    });
}

export function useDeactivateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => tasksApi.deactivate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

export function useReactivateTask() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => tasksApi.reactivate(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

// Assignment hooks
export function useAssignUsers() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: TaskAssignmentDto }) =>
            tasksApi.assignUsers(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

export function useUnassignUsers() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: TaskAssignmentDto }) =>
            tasksApi.unassignUsers(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

export function useAssignGroups() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: TaskAssignmentDto }) =>
            tasksApi.assignGroups(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

export function useUnassignGroups() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: TaskAssignmentDto }) =>
            tasksApi.unassignGroups(id, dto),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        },
    });
}

// Delegation hooks
export function useTaskDelegations(taskId: number) {
    return useQuery({
        queryKey: taskKeys.delegations(taskId),
        queryFn: () => tasksApi.getDelegations(taskId),
        enabled: !!taskId,
    });
}

export function useCreateDelegation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ taskId, dto }: { taskId: number; dto: CreateDelegationDto }) =>
            tasksApi.createDelegation(taskId, dto),
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.delegations(taskId) });
        },
    });
}

export function useUpdateDelegation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ taskId, delegationId, dto }: { taskId: number; delegationId: number; dto: UpdateDelegationDto }) =>
            tasksApi.updateDelegation(taskId, delegationId, dto),
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.delegations(taskId) });
        },
    });
}

export function useDeleteDelegation() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ taskId, delegationId }: { taskId: number; delegationId: number }) =>
            tasksApi.deleteDelegation(taskId, delegationId),
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: taskKeys.delegations(taskId) });
        },
    });
}
