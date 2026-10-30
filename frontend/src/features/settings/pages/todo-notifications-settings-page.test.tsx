import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoNotificationsSettingsPage } from './todo-notifications-settings-page';
import { NotificationsSettingsPage } from './notifications-settings-page';

const state = vi.hoisted(() => ({
    linked: [] as number[],
    updateSetting: vi.fn(),
    updateChannel: vi.fn(),
}));

const CHANNELS = [
    { id: 1, name: 'Mail', type: 'EMAIL', enabled: true, config: {}, taskCount: 3 },
    { id: 2, name: 'Équipe', type: 'SLACK', enabled: true, config: {} },
    { id: 3, name: 'Vieux', type: 'TEAMS', enabled: false, config: {} },
];

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, values?: Record<string, string>) => (values?.name ? `${key}:${values.name}` : key) }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-notifications', () => {
    const mutation = { mutateAsync: vi.fn() };
    return {
        useChannels: () => ({ data: CHANNELS, isLoading: false }),
        useCreateChannel: () => mutation,
        useUpdateChannel: () => ({ mutateAsync: state.updateChannel }),
        useDeleteChannel: () => mutation,
        useTestChannel: () => mutation,
    };
});
vi.mock('../hooks/use-settings', () => ({
    useSettings: () => ({
        getSetting: (key: string) => (key === 'addons.todolist.notify.channelIds' ? state.linked : undefined),
        getSettingAsBool: (key: string) => key === 'addons.todolist.enabled',
        updateSetting: state.updateSetting,
    }),
}));

describe('TodoNotificationsSettingsPage', () => {
    beforeEach(() => {
        state.linked = [];
        state.updateSetting.mockReset();
    });

    it('links a channel to the todolist', () => {
        state.linked = [1];
        render(<TodoNotificationsSettingsPage />);

        fireEvent.click(screen.getByRole('switch', { name: 'settings.todoNotifications.toggleAria:Équipe' }));

        expect(state.updateSetting).toHaveBeenCalledWith({ key: 'addons.todolist.notify.channelIds', value: [1, 2] });
    });

    it('unlinks a channel', () => {
        state.linked = [1, 2];
        render(<TodoNotificationsSettingsPage />);

        fireEvent.click(screen.getByRole('switch', { name: 'settings.todoNotifications.toggleAria:Mail' }));

        expect(state.updateSetting).toHaveBeenCalledWith({ key: 'addons.todolist.notify.channelIds', value: [2] });
    });

    it('does not offer a channel switched off in the channels settings', () => {
        render(<TodoNotificationsSettingsPage />);

        expect(screen.getByRole('switch', { name: 'settings.todoNotifications.toggleAria:Vieux' })).toHaveProperty('disabled', true);
        expect(screen.getByText('settings.todoNotifications.channelOff')).toBeDefined();
    });
});

describe('NotificationsSettingsPage guard for channels linked to the todolist', () => {
    beforeEach(() => {
        state.linked = [];
        state.updateChannel.mockReset().mockResolvedValue(undefined);
    });

    it('asks before switching off a channel the todolist uses', async () => {
        state.linked = [2];
        render(<NotificationsSettingsPage />);

        fireEvent.click(screen.getByRole('switch', { name: 'Équipe' }));

        expect(state.updateChannel).not.toHaveBeenCalled();
        expect(screen.getByText('settings.notifications.inUseTitle')).toBeDefined();

        fireEvent.click(screen.getByRole('button', { name: 'settings.todoNotifications.disableAnyway' }));
        expect(state.updateChannel).toHaveBeenCalledWith({ id: 2, dto: { enabled: false } });
    });

    it('switches off a channel the todolist does not use straight away', () => {
        render(<NotificationsSettingsPage />);

        fireEvent.click(screen.getByRole('switch', { name: 'Équipe' }));

        expect(state.updateChannel).toHaveBeenCalledWith({ id: 2, dto: { enabled: false } });
        expect(screen.queryByText('settings.notifications.inUseTitle')).toBeNull();
    });

    it('marks the linked channel and warns when deleting it', () => {
        state.linked = [2];
        render(<NotificationsSettingsPage />);

        expect(screen.getAllByText('settings.todoNotifications.linkedBadge')).toHaveLength(1);

        fireEvent.click(screen.getAllByRole('button', { name: 'settings.notifications.deleteAria' })[1]);
        expect(screen.getByRole('alert').textContent).toContain('settings.todoNotifications.linkedDeleteWarning');
    });

    it('warns before switching off or deleting a channel that tasks use', () => {
        render(<NotificationsSettingsPage />);

        expect(screen.getByText('settings.notifications.tasksBadge')).toBeDefined();

        fireEvent.click(screen.getByRole('switch', { name: 'Mail' }));
        expect(state.updateChannel).not.toHaveBeenCalled();
        expect(screen.getByText('settings.notifications.inUseTitle')).toBeDefined();
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));

        fireEvent.click(screen.getAllByRole('button', { name: 'settings.notifications.deleteAria' })[0]);
        expect(screen.getByRole('alert').textContent).toContain('settings.notifications.tasksDeleteWarning');
    });
});
