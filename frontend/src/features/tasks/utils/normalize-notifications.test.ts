import { describe, expect, it } from 'vitest';
import { normalizeNotifications } from './normalize-notifications';
import { createTaskSchema } from '../schemas/task-creation.schema';

describe('normalizeNotifications', () => {
    it('turns null recipient lists into empty ones and defaults the delay', () => {
        const [row] = normalizeNotifications([
            {
                channelId: 1,
                notifyOnReminder: true,
                emailUserIds: null,
                emailGroupIds: null,
                emailCustom: null,
                id: 4,
                createdAt: '2026-11-06',
            } as never,
        ]);

        expect(row).toEqual({
            channelId: 1,
            notifyOnFailed: true,
            notifyOnMissing: true,
            notifyOnReminder: true,
            reminderOffsetMinutes: 60,
            emailUserIds: [],
            emailGroupIds: [],
            emailCustom: [],
        });
    });

    it('keeps the delay that was saved', () => {
        const [row] = normalizeNotifications([{ channelId: 1, reminderOffsetMinutes: 90 }]);
        expect(row.reminderOffsetMinutes).toBe(90);
    });

    it('handles no rows', () => {
        expect(normalizeNotifications(undefined)).toEqual([]);
    });

    it('produces rows the task form accepts', () => {
        const notifications = normalizeNotifications([
            { channelId: 1, emailUserIds: null, emailGroupIds: null, emailCustom: null } as never,
        ]);
        const result = createTaskSchema.safeParse({
            name: 'Backup serveurs',
            description: 'Vérification du rapport',
            priority: 'MEDIUM',
            periodicity: 'daily',
            interval: 1,
            startDate: new Date(),
            procedureMode: 'URL',
            recurrenceMode: 'ON_SCHEDULE',
            useGlobalWindowDefaults: true,
            notifications,
        });
        expect(result.success).toBe(true);
    });
});
