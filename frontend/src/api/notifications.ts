import { http } from './http';

export interface NotificationChannel {
    id: number;
    name: string;
    type: 'EMAIL' | 'TEAMS' | 'SLACK' | 'WEBHOOK' | 'TELEGRAM' | 'DISCORD' | 'PUSH';
    config: Record<string, unknown>;
    enabled: boolean;
    createdAt: string;
}

export interface TaskNotificationDto {
    channelId: number;
    notifyOnFailed: boolean;
    notifyOnMissing: boolean;
    notifyOnReminder: boolean;
    emailUserIds?: number[];
    emailGroupIds?: number[];
    emailCustom?: string[];
}

export const notificationsApi = {
    /**
     * Get all notification channels, optionally filtered by active status.
     */
    getChannels: () =>
        http.get<NotificationChannel[]>('/notifications/channels'),

    /**
     * Get task notifications
     */
    getTaskNotifications: (taskId: number) =>
        http.get<TaskNotificationDto[]>(`/tasks/${taskId}/notifications`),

    /**
     * Save task notifications
     */
    saveTaskNotifications: (taskId: number, dto: { notifications: TaskNotificationDto[] }) =>
        http.put<void>(`/tasks/${taskId}/notifications`, dto),

    /**
     * Create a notification channel
     */
    createChannel: (dto: { name: string; type: string; config?: Record<string, unknown>; enabled?: boolean }) =>
        http.post<NotificationChannel>('/notifications/channels', dto),

    /**
     * Update a notification channel
     */
    updateChannel: (id: number, dto: { name?: string; type?: string; config?: Record<string, unknown>; enabled?: boolean }) =>
        http.patch<NotificationChannel>(`/notifications/channels/${id}`, dto),

    /**
     * Delete a notification channel
     */
    deleteChannel: (id: number) =>
        http.delete<void>(`/notifications/channels/${id}`),

    /**
     * Test a notification channel
     */
    testChannel: (id: number, data?: { testEmailAddress?: string }) =>
        http.post<{ success: boolean; message: string }>(`/notifications/channels/${id}/test`, data),
};

// ─── Web Push API ──────────────────────────────────────────────────────────

export const pushApi = {
    /** Retourne la clé publique VAPID du serveur. */
    getVapidPublicKey: () =>
        http.get<{ publicKey: string | null }>('/push/vapid-public-key'),

    /** Enregistre l'abonnement push du navigateur courant. */
    subscribe: (subscription: PushSubscriptionJSON) =>
        http.post<{ success: boolean }>('/push/subscribe', {
            endpoint: subscription.endpoint,
            keys: subscription.keys,
        }),

    /** Supprime l'abonnement push du navigateur courant. */
    unsubscribe: (endpoint: string) =>
        http.delete<{ success: boolean }>('/push/unsubscribe', { data: { endpoint } }),
};
