import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi } from '@/api/notifications';
import type { TaskNotificationDto } from '@/api/notifications';

export const useChannels = (enabled?: boolean) => {
    return useQuery({
        queryKey: ['notifications', 'channels', { enabled }],
        queryFn: async () => {
            const res = await notificationsApi.getChannels();
            if (enabled !== undefined) {
                return res.filter(c => c.enabled === enabled);
            }
            return res;
        }
    });
};

export const useTaskNotifications = (taskId: number) => {
    return useQuery({
        queryKey: ['tasks', taskId, 'notifications'],
        queryFn: () => notificationsApi.getTaskNotifications(taskId),
        enabled: !!taskId,
    });
};

export const useSaveTaskNotifications = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ taskId, notifications }: { taskId: number; notifications: TaskNotificationDto[] }) =>
            notificationsApi.saveTaskNotifications(taskId, { notifications }),
        onSuccess: (_, { taskId }) => {
            queryClient.invalidateQueries({ queryKey: ['tasks', taskId, 'notifications'] });
        },
    });
};

export const useCreateChannel = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (dto: Parameters<typeof notificationsApi.createChannel>[0]) =>
            notificationsApi.createChannel(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
        },
    });
};

export const useUpdateChannel = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: Parameters<typeof notificationsApi.updateChannel>[1] }) =>
            notificationsApi.updateChannel(id, dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
        },
    });
};

export const useDeleteChannel = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => notificationsApi.deleteChannel(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['notifications', 'channels'] });
        },
    });
};

export const useTestChannel = () => {
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data?: { testEmailAddress?: string } }) =>
            notificationsApi.testChannel(id, data),
    });
};
