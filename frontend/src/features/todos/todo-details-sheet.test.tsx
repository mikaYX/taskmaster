import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Todo, TodoComment } from '@/api/todos';
import { TodoDetailsSheet } from './todo-details-sheet';

const hooks = vi.hoisted(() => ({
    comments: { data: undefined as TodoComment[] | undefined, isLoading: false, isSuccess: true, dataUpdatedAt: 1 },
    addMutate: vi.fn(),
    markMutate: vi.fn(),
    deleteMutate: vi.fn(),
}));

vi.mock('@/hooks/use-todos', () => ({
    useTodoComments: () => hooks.comments,
    useTodoAttachments: () => ({ data: [], isLoading: false }),
    useAddTodoComment: () => ({ mutate: hooks.addMutate, isPending: false }),
    useDeleteTodoComment: () => ({ mutate: hooks.deleteMutate, isPending: false }),
    useMarkCommentsRead: () => ({ mutate: hooks.markMutate, isPending: false }),
    useAddTodoAttachment: () => ({ mutate: vi.fn(), isPending: false }),
    useDeleteTodoAttachment: () => ({ mutate: vi.fn(), isPending: false }),
    useMentionTargets: () => ({ data: { users: [], groups: [] }, isLoading: false, isError: false }),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const todo = (id: number, extra: Partial<Todo> = {}): Todo => ({
    id,
    title: `Todo ${id}`,
    isCompleted: false,
    completedAt: null,
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
    userId: 1,
    createdAt: '2026-10-19T10:00:00.000Z',
    ...extra,
});

const author = (id: number, name: string) => ({ id, username: name.toLowerCase(), fullname: name });
const comment = (id: number, extra: Partial<TodoComment> = {}): TodoComment => ({
    id,
    todoId: 1,
    userId: 2,
    parentId: null,
    body: `Comment ${id}`,
    createdAt: '2026-10-19T10:00:00.000Z',
    user: author(2, 'Marie'),
    mentions: [],
    ...extra,
});

function show(t: Todo = todo(1)) {
    return render(<TodoDetailsSheet todo={t} currentUserId={1} isManager={false} onClose={vi.fn()} />);
}

describe('TodoDetailsSheet discussions', () => {
    beforeEach(() => {
        hooks.addMutate.mockReset();
        hooks.markMutate.mockReset();
        hooks.comments = { data: [], isLoading: false, isSuccess: true, dataUpdatedAt: 1 };
    });

    it('groups the answers under their root comment, oldest first', () => {
        hooks.comments.data = [
            comment(1, { body: 'Root A' }),
            comment(2, { body: 'Other root' }),
            comment(3, { body: 'First answer', parentId: 1 }),
            comment(4, { body: 'Second answer', parentId: 1 }),
        ];
        show();

        const threads = screen.getAllByLabelText('Discussion');
        expect(threads).toHaveLength(2);
        const first = within(threads[0]);
        const text = threads[0].textContent ?? '';
        expect(first.getByText('Root A')).toBeTruthy();
        expect(text.indexOf('Root A')).toBeLessThan(text.indexOf('First answer'));
        expect(text.indexOf('First answer')).toBeLessThan(text.indexOf('Second answer'));
        expect(within(threads[1]).queryByText('First answer')).toBeNull();
    });

    it('answers a reply inside the same thread, with the message answered shown', async () => {
        hooks.comments.data = [comment(1), comment(3, { body: 'An answer', parentId: 1 })];
        const user = userEvent.setup();
        show();

        await user.click(screen.getAllByRole('button', { name: 'Reply to Marie' })[1]);
        expect(screen.getByText(/Replying to Marie: An answer/)).toBeTruthy();
        await user.type(screen.getByLabelText('Your reply'), 'Thanks');
        const replyForm = screen.getByLabelText('Your reply').closest('form') as HTMLElement;
        await user.click(within(replyForm).getByRole('button', { name: 'Send' }));

        expect(hooks.addMutate).toHaveBeenCalledWith(
            { body: 'Thanks', parentId: 1, mentions: [] },
            expect.anything(),
        );
    });

    it('cancels a reply without sending', async () => {
        hooks.comments.data = [comment(1)];
        const user = userEvent.setup();
        show();

        await user.click(screen.getByRole('button', { name: 'Reply to Marie' }));
        await user.type(screen.getByLabelText('Your reply'), 'draft');
        await user.click(screen.getByRole('button', { name: 'Cancel' }));

        expect(screen.queryByLabelText('Your reply')).toBeNull();
        expect(hooks.addMutate).not.toHaveBeenCalled();
    });

    it('shows a deleted root as a slot without its old text, and highlights stored mentions', () => {
        hooks.comments.data = [
            comment(1, { body: '', deleted: true }),
            comment(2, {
                body: 'Hello @Éloïse Martin',
                mentions: [{ id: 1, userId: 5, groupId: null, user: { id: 5, username: 'eloise', fullname: 'Éloïse Martin' } }],
            }),
            comment(3, { body: 'Still here', parentId: 1 }),
        ];
        show();

        expect(screen.getByText('This comment was deleted.')).toBeTruthy();
        expect(screen.getByText('Still here')).toBeTruthy();
        expect(screen.getByText('@Éloïse Martin').className).toContain('text-primary');
    });

    it('marks as read only what was displayed, once the comments loaded', () => {
        hooks.comments.data = [comment(7), comment(9)];
        show(todo(1, { unreadComments: 2 }));

        expect(hooks.markMutate).toHaveBeenCalledTimes(1);
        expect(hooks.markMutate.mock.calls[0][0]).toBe(9);
    });

    it('does not mark anything while loading, after a failed load, or when nothing is unread', () => {
        hooks.comments = { data: undefined, isLoading: true, isSuccess: false, dataUpdatedAt: 0 };
        const { unmount } = show(todo(1, { unreadComments: 2 }));
        unmount();

        hooks.comments = { data: undefined, isLoading: false, isSuccess: false, dataUpdatedAt: 0 };
        const second = show(todo(1, { unreadComments: 2 }));
        second.unmount();

        hooks.comments = { data: [comment(7)], isLoading: false, isSuccess: true, dataUpdatedAt: 1 };
        show(todo(1, { unreadComments: 0 }));

        expect(hooks.markMutate).not.toHaveBeenCalled();
    });

    it('does not keep a draft when another todo is opened', async () => {
        const user = userEvent.setup();
        const { rerender } = show(todo(1));
        await user.type(screen.getByLabelText('New comment'), 'half written');

        rerender(<TodoDetailsSheet todo={todo(2)} currentUserId={1} isManager={false} onClose={vi.fn()} />);

        expect((screen.getByLabelText('New comment') as HTMLTextAreaElement).value).toBe('');
    });

    it('sends the mentions picked in the list with a new comment', async () => {
        const user = userEvent.setup();
        show();

        await user.type(screen.getByLabelText('New comment'), 'Plain text');
        await user.click(screen.getByRole('button', { name: 'Send' }));

        expect(hooks.addMutate).toHaveBeenCalledWith(
            { body: 'Plain text', parentId: undefined, mentions: [] },
            expect.anything(),
        );
    });
});
