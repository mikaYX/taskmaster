import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import i18n from '@/lib/i18n';
import { EditTaskPage } from './edit-task-page';

const mutateAsync = vi.fn();
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn() }));
// Stable references, like react-query: a new object per render would re-run the form reset forever.
const fixtures = vi.hoisted(() => ({
    task: {
        id: 1, name: 'test', description: 'sqsqsdqds', priority: 'MEDIUM', periodicity: 'daily',
        startDate: '2026-10-27', rrule: 'FREQ=DAILY;INTERVAL=1', recurrenceMode: 'ON_SCHEDULE',
        useGlobalWindowDefaults: true, skipWeekends: false, skipHolidays: false, timezone: 'Europe/Paris',
        assignedUserIds: [] as number[], assignedGroupIds: [] as number[], executionChecklist: [] as unknown[],
    },
    taskResult: null as unknown,
    notifications: { data: [] as unknown[] },
    channels: { data: [{ id: 1, name: 'SMTP', type: 'EMAIL', enabled: true }], isLoading: false },
    updateTask: { mutateAsync: vi.fn(), isPending: false },
    settings: { getSettingAsBool: () => false },
}));
fixtures.taskResult = { isLoading: false, data: fixtures.task };

vi.mock('sonner', () => ({ toast }));
vi.mock('@/hooks/use-tasks', () => ({
    useTask: () => fixtures.taskResult,
    useUpdateTask: () => fixtures.updateTask,
}));
vi.mock('@/hooks/use-notifications', () => ({
    useTaskNotifications: () => fixtures.notifications,
    useSaveTaskNotifications: () => ({ mutateAsync, isPending: false }),
    useChannels: () => fixtures.channels,
}));
vi.mock('@/features/settings/hooks/use-settings', () => ({
    useSettings: () => fixtures.settings,
}));
vi.mock('@/api/users', () => ({ usersApi: { getAll: async () => [] } }));
vi.mock('@/api/groups', () => ({ groupsApi: { getAll: async () => [] } }));
vi.mock('./wizard/steps/step-definition', () => ({ StepDefinition: () => null }));
vi.mock('./wizard/steps/step-scheduling', () => ({ StepScheduling: () => null }));
vi.mock('./wizard/steps/step-assignment', () => ({ StepAssignment: () => null }));

describe('EditTaskPage - notifications tab', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('fr');
    });
    beforeEach(() => {
        vi.clearAllMocks();
        fixtures.updateTask.mutateAsync.mockReset();
        mutateAsync.mockResolvedValue(undefined);
    });

    it('saves the SMTP channel with its reminder delay', async () => {
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <MemoryRouter initialEntries={['/task-definitions/1/edit']}>
                    <Routes><Route path="/task-definitions/:id/edit" element={<EditTaskPage />} /></Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        );

        await user.click(screen.getByRole('tab', { name: /Notifications/ }));
        await user.click(await screen.findByRole('switch'));
        await user.click(screen.getByRole('checkbox', { name: /Rappel/ }));
        expect(screen.getByTestId('reminder-offset')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /Enregistrer les notifications/ }));

        await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
        console.log('CALL', JSON.stringify(mutateAsync.mock.calls[0][0]), 'TOAST', JSON.stringify([toast.success.mock.calls, toast.error.mock.calls]));
        expect(mutateAsync.mock.calls[0][0].notifications[0]).toMatchObject({ channelId: 1, notifyOnReminder: true, reminderOffsetMinutes: 60 });
    });

    it('saves the task and its notifications from the main button', async () => {
        fixtures.updateTask.mutateAsync.mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <MemoryRouter initialEntries={['/task-definitions/1/edit']}>
                    <Routes><Route path="/task-definitions/:id/edit" element={<EditTaskPage />} /></Routes>
                </MemoryRouter>
            </QueryClientProvider>,
        );

        await user.click(screen.getByRole('tab', { name: /Notifications/ }));
        await user.click(await screen.findByRole('switch'));
        await user.click(screen.getByRole('checkbox', { name: /Rappel/ }));

        await user.click(screen.getAllByRole('button', { name: /Enregistrer les modifications/ })[0]);

        await waitFor(() => expect(fixtures.updateTask.mutateAsync).toHaveBeenCalled());
        await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
        expect(mutateAsync.mock.calls[0][0].notifications[0].reminderOffsetMinutes).toBe(60);
        // The saved start date is in the past and the API refuses that: it must not be sent again.
        const dto = fixtures.updateTask.mutateAsync.mock.calls[0][0].dto;
        expect(dto).not.toHaveProperty('startDate', expect.any(String));
        expect(dto.name).toBe('test');
    });
});
