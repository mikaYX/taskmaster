import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/api/todos';
import { TodosPage } from './todos-page';

const api = vi.hoisted(() => ({ getOne: vi.fn() }));
const toastError = vi.hoisted(() => vi.fn());
const idle = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false }));
const sheetProps = vi.hoisted(() => ({ last: null as null | { todo: { id: number } | null; focusCommentId: number | null } }));

vi.mock('@/api/todos', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/api/todos')>()),
    todosApi: { getOne: api.getOne },
}));
vi.mock('sonner', () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock('@/hooks/use-todos', () => ({
    todoKeys: { preferences: ['todos', 'preferences'] },
    useTodos: () => ({ data: [], isLoading: false }),
    useCreateTodo: idle,
    useUpdateTodo: idle,
    useClearCompletedTodos: idle,
    useReorderTodos: idle,
    useDeleteTodo: idle,
    useTodoSummary: () => ({ data: { overdue: 0, dueToday: 0, open: 0, mine: 0 } }),
    useDispatchTargets: () => ({ data: [] }),
    useTodoHistory: () => ({ data: undefined, isLoading: false }),
    useTodoPreferences: () => ({ data: undefined, isLoading: true }),
    useUpdateTodoPreferences: idle,
}));
vi.mock('./todo-details-sheet', () => ({
    TodoDetailsSheet: (props: { todo: { id: number; title: string } | null; focusCommentId: number | null }) => {
        sheetProps.last = props;
        return props.todo ? <div role="dialog">Details of {props.todo.title}</div> : null;
    },
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

const ticked: Todo = {
    id: 12,
    title: 'Old ticked todo',
    isCompleted: true,
    completedAt: '2026-01-01T10:00:00.000Z', // far beyond the 24 h of the lists
    dueDate: null,
    scope: 'COLLECTIVE',
    priority: 'NORMAL',
    description: null,
    dueTime: null,
    remindBeforeMinutes: null,
    position: 0,
    parentId: null,
    completedBy: null,
    assigneeId: null,
    assignee: null,
    groupId: null,
    userId: 3,
    createdAt: '2026-01-01T09:00:00.000Z',
};

function open(url: string) {
    render(
        <QueryClientProvider client={new QueryClient()}>
            <MemoryRouter initialEntries={[url]}>
                <TodosPage />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}

describe('TodosPage opened from a link', () => {
    beforeEach(() => {
        api.getOne.mockReset();
        toastError.mockReset();
        sheetProps.last = null;
    });

    it('opens a todo that the lists do not show, on the targeted comment', async () => {
        api.getOne.mockResolvedValue(ticked);
        open('/todos?todoId=12&commentId=40');

        expect(await screen.findByText('Details of Old ticked todo')).toBeTruthy();
        expect(api.getOne).toHaveBeenCalledWith(12);
        expect(sheetProps.last?.focusCommentId).toBe(40);
        expect(toastError).not.toHaveBeenCalled();
    });

    it('says the same thing whether the todo is missing or forbidden, and opens nothing', async () => {
        api.getOne.mockRejectedValue(new Error('404'));
        open('/todos?todoId=99');

        await waitFor(() => expect(toastError).toHaveBeenCalledWith('This todo is not available.'));
        expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('refuses a malformed target without calling the API', async () => {
        open('/todos?todoId=abc');

        await waitFor(() => expect(toastError).toHaveBeenCalledWith('This todo is not available.'));
        expect(api.getOne).not.toHaveBeenCalled();
    });

    it('keeps the plain list for an old link without a target', () => {
        open('/todos');

        expect(api.getOne).not.toHaveBeenCalled();
        expect(screen.queryByRole('dialog')).toBeNull();
        expect(toastError).not.toHaveBeenCalled();
    });
});
