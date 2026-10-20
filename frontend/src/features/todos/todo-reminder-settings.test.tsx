import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodoReminderSettings } from './todo-reminder-settings';

const prefs = vi.hoisted(() => ({
    data: undefined as undefined | Record<string, unknown>,
    isLoading: false,
}));
const update = vi.hoisted(() => ({ mutate: vi.fn() }));
const push = vi.hoisted(() => ({
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    isLoading: false,
    error: null as string | null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
}));

vi.mock('@/hooks/use-todos', () => ({
    todoKeys: { preferences: ['todos', 'preferences'] },
    useTodoPreferences: () => prefs,
    useUpdateTodoPreferences: () => update,
}));
vi.mock('@/hooks/use-push-notifications', () => ({ usePushNotifications: () => push }));

async function open() {
    const user = userEvent.setup();
    render(
        <QueryClientProvider client={new QueryClient()}>
            <TodoReminderSettings />
        </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Reminders' }));
    return user;
}

describe('TodoReminderSettings', () => {
    beforeEach(() => {
        prefs.data = { email: true, push: true, collective: false, pushAvailable: true, pushDevices: 0 };
        update.mutate.mockReset();
        push.subscribe.mockReset();
        push.isSubscribed = false;
        push.isSupported = true;
        push.permission = 'default';
    });

    it('saves each preference as soon as it is switched', async () => {
        const user = await open();

        await user.click(screen.getByRole('switch', { name: 'By email' }));
        await user.click(screen.getByRole('switch', { name: /Collective tasks/ }));

        expect(update.mutate).toHaveBeenNthCalledWith(1, { email: false }, expect.anything());
        expect(update.mutate).toHaveBeenNthCalledWith(2, { collective: true }, expect.anything());
    });

    it('enables pop-ups on this device', async () => {
        const user = await open();

        await user.click(screen.getByRole('button', { name: 'Enable on this device' }));

        expect(push.subscribe).toHaveBeenCalled();
    });

    it('explains why pop-ups are unavailable', async () => {
        prefs.data = { ...prefs.data, pushAvailable: false };
        await open();

        expect(screen.getByText('Pop-up notifications are not available on this server.')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Enable on this device' })).toBeNull();
    });

    it('explains a browser without support or with blocked notifications', async () => {
        push.isSupported = false;
        await open();

        expect(screen.getByText(/does not support pop-up notifications/)).toBeTruthy();
    });
});
