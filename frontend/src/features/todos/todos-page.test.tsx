import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TodosPage } from './todos-page';

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const idle = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/use-todos', () => ({
    todoKeys: { preferences: ['todos', 'preferences'] },
    useTodos: () => ({ data: [], isLoading: false }),
    useCreateTodo: () => create,
    useUpdateTodo: idle,
    useClearCompletedTodos: idle,
    useReorderTodos: idle,
    useDeleteTodo: idle,
    useTodoSummary: () => ({ data: { overdue: 0, dueToday: 0, open: 0, mine: 0 } }),
    useTodoHistory: () => ({ data: undefined, isLoading: false }),
    useTodoPreferences: () => ({ data: undefined, isLoading: true }),
    useUpdateTodoPreferences: idle,
}));
vi.mock('@/hooks/use-push-notifications', () => ({
    usePushNotifications: () => ({ isSupported: true, permission: 'default', isSubscribed: false, isLoading: false, error: null }),
}));
vi.mock('@/hooks/use-groups', () => ({ useGroups: () => ({ data: [] }) }));
vi.mock('@/hooks/use-users', () => ({ useUsers: () => ({ data: [] }) }));
vi.mock('@/hooks/use-public-branding', () => ({
    usePublicBranding: () => ({ isLoading: false, getSettingAsBool: () => true }),
}));
vi.mock('@/stores', () => ({
    useAuthStore: (selector: (s: { role: string; userId: number }) => unknown) => selector({ role: 'USER', userId: 1 }),
}));

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

async function setup() {
    const user = userEvent.setup();
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter>
                <TodosPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'More options' }));
    return user;
}

describe('TodosPage creation options', () => {
    beforeEach(() => create.mutate.mockReset());

    it('lets the time be set without a date, and then the task is due today', async () => {
        const user = await setup();
        const time = screen.getByLabelText('Time') as HTMLInputElement;
        expect(time.disabled).toBe(false);

        await user.type(screen.getByLabelText('New task'), 'Call Paul');
        await user.type(time, '14:30');
        expect(screen.getByText('No due date chosen: the task will be due today.')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Add' }));

        expect(create.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Call Paul', dueDate: today(), dueTime: '14:30' }),
            expect.anything(),
        );
    });

    it('keeps a task without date when neither time nor reminder is chosen', async () => {
        const user = await setup();

        await user.type(screen.getByLabelText('New task'), 'Someday');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        expect(create.mutate.mock.calls[0][0]).toMatchObject({ title: 'Someday', dueDate: undefined, dueTime: undefined });
    });
});
