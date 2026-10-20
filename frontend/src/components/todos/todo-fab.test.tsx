import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/api/todos';
import { TodoFab } from './todo-fab';

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const day = (offset: number) => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString();
};
const base: Todo = {
    id: 1, title: 'x', isCompleted: false, completedAt: null, dueDate: null, scope: 'PRIVATE', priority: 'NORMAL',
    recurrence: 'NONE', description: null, dueTime: null, remindBeforeMinutes: null, position: 0, parentId: null,
    completedBy: null, assigneeId: null, assignee: null, groupId: null, userId: 1, createdAt: day(0),
};
const todos: Todo[] = [
    { ...base, id: 1, title: 'Relancer le devis', dueDate: day(-2) },
    { ...base, id: 2, title: 'Vérifier les sauvegardes', dueDate: day(0) },
    { ...base, id: 3, title: 'Préparer la réunion', dueDate: day(5) },
    { ...base, id: 4, title: 'Ranger le local' },
    { ...base, id: 5, title: 'Sous-tâche', parentId: 4 },
];

vi.mock('@/hooks/use-todos', () => ({
    useTodos: () => ({ data: todos }),
    useCreateTodo: () => create,
    useUpdateTodo: () => ({ mutate: vi.fn() }),
    useDeleteTodo: () => ({ mutate: vi.fn() }),
    useTodoSummary: () => ({ data: undefined }),
}));
vi.mock('@/stores', () => ({
    useAuthStore: (selector: (s: { role: string; userId: number }) => unknown) => selector({ role: 'USER', userId: 1 }),
}));

async function open() {
    const user = userEvent.setup();
    render(
        <MemoryRouter>
            <TodoFab />
        </MemoryRouter>,
    );
    await user.click(screen.getByRole('button', { name: 'My todos' }));
    return user;
}

describe('TodoFab', () => {
    it('groups open tasks by when they are due, without subtasks', async () => {
        await open();

        const section = (name: RegExp) => within(screen.getByRole('region', { name }));
        expect(section(/Overdue/).getByText('Relancer le devis')).toBeTruthy();
        expect(section(/Today/).getByText('Vérifier les sauvegardes')).toBeTruthy();
        expect(section(/Upcoming/).getByText('Préparer la réunion')).toBeTruthy();
        expect(section(/No due date/).getByText('Ranger le local')).toBeTruthy();
        expect(screen.queryByText('Sous-tâche')).toBeNull();
        expect(screen.getByText('4 tasks in progress')).toBeTruthy();
    });

    it('reads the quick-add words in the title', async () => {
        const user = await open();

        await user.type(screen.getByLabelText('New private task...'), 'Appeler Paul !urgent');
        await user.click(screen.getByRole('button', { name: 'Add' }));

        expect(create.mutate).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Appeler Paul', priority: 'URGENT', scope: 'PRIVATE' }),
            expect.anything(),
        );
    });
});
