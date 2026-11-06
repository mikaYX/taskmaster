import type { TaskNotificationDto } from '@/api/notifications';

/**
 * What the API returns for a task is not what the form accepts: a row saved
 * without recipients holds `null` lists, and one saved before the reminder
 * delay existed has no delay. Either makes the form silently invalid.
 */
export function normalizeNotifications(
    rows: Partial<TaskNotificationDto>[] | undefined | null,
): TaskNotificationDto[] {
    return (rows ?? []).map((row) => ({
        channelId: row.channelId as number,
        notifyOnFailed: row.notifyOnFailed ?? true,
        notifyOnMissing: row.notifyOnMissing ?? true,
        notifyOnReminder: row.notifyOnReminder ?? false,
        reminderOffsetMinutes: row.reminderOffsetMinutes ?? 60,
        emailUserIds: row.emailUserIds ?? [],
        emailGroupIds: row.emailGroupIds ?? [],
        emailCustom: row.emailCustom ?? [],
    }));
}
