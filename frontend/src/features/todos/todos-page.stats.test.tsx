import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TodosPage } from './todos-page';

const privateTodo = vi.hoisted(() => ({
    id: 1,
    title: 'Private chore',
    scope: 'PRIVATE',
    parentId: null,
    isCompleted: false,
    dueDate: null,
    dueTime: null,
    priority: 'NORMAL',
    assigneeId: null,
    groupId: null,
    description: null,
    createdAt: new Date().toISOString(),
}));

const create = vi.hoisted(() => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }));
const idle = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));

vi.mock('@/hooks/use-todos', () => ({
    todoKeys: { preferences: ['todos', 'preferences'] },
    useTodos: (scope: string) => ({ data: scope === 'PRIVATE' ? [privateTodo] : [], isLoading: false }),
    useCreateTodo: () => create,
    useUpdateTodo: idle,
    useClearCompletedTodos: idle,
    useReorderTodos: idle,
    useDeleteTodo: idle,
    useTodoSummary: () => ({ data: { overdue: 0, dueToday: 0, open: 1, mine: 0 } }),
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


describe('TodosPage counter tiles', () => {
    it('opens the tab holding the todos the "open" counter counts', async () => {
        const user = userEvent.setup();
        render(
            <QueryClientProvider client={new QueryClient()}>
                <MemoryRouter>
                    <TodosPage />
                </MemoryRouter>
            </QueryClientProvider>,
        );

        // The collective tab is empty: switch to it, then use the counter.
        const tabs = screen.getAllByRole('tab');
        await user.click(tabs[1]);
        expect(screen.queryByText('Private chore')).toBeNull();

        await user.click(screen.getByRole('button', { name: /Open|In progress/i }));
        expect(screen.getByText('Private chore')).toBeTruthy();
    });
});
