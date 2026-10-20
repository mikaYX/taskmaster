import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/api/todos';
import { TodoEditDialog } from './todo-edit-dialog';
import { buildTodoUpdate } from './todo-update';
import i18n from '@/lib/i18n';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

const todo: Todo = {
    id: 4,
    title: 'Appeler le prestataire',
    isCompleted: false,
    completedAt: null,
    dueDate: '2026-11-02T00:00:00.000Z',
    scope: 'PRIVATE',
    priority: 'NORMAL',
    description: null,
    dueTime: null,
    remindBeforeMinutes: null,
    position: 0,
    assigneeId: null,
    assignee: null,
    parentId: null,
    completedBy: null,
    groupId: null,
    userId: 7,
    createdAt: '2026-10-19T10:00:00.000Z',
};

function setup(overrides: Partial<Parameters<typeof TodoEditDialog>[0]> = {}) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<TodoEditDialog todo={todo} onSave={onSave} onClose={onClose} {...overrides} />);
    return { onSave, onClose, user: userEvent.setup() };
}

describe('TodoEditDialog', () => {
    it('pre-fills the current title and due date', () => {
        setup();

        expect((screen.getByLabelText('Titre') as HTMLInputElement).value).toBe('Appeler le prestataire');
        expect((screen.getByLabelText('Échéance') as HTMLInputElement).value).toBe('2026-11-02');
    });

    it('saves only the changed title, trimmed', async () => {
        const { onSave, user } = setup();

        const title = screen.getByLabelText('Titre');
        await user.clear(title);
        await user.type(title, '  Relancer le prestataire  ');
        await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

        expect(onSave).toHaveBeenCalledWith(4, { title: 'Relancer le prestataire' });
    });

    it('clears the due date with null', async () => {
        const { onSave, user } = setup();

        await user.click(screen.getByRole('button', { name: 'Effacer' }));
        await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

        expect(onSave).toHaveBeenCalledWith(4, { dueDate: null });
    });

    it('closes without saving when nothing changed', async () => {
        const { onSave, onClose, user } = setup();

        await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

        expect(onSave).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalled();
    });

    it('does not allow saving an empty title', async () => {
        const { user } = setup();

        await user.clear(screen.getByLabelText('Titre'));

        expect((screen.getByRole('button', { name: 'Enregistrer' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('renders nothing without a todo', () => {
        render(<TodoEditDialog todo={null} onSave={vi.fn()} onClose={vi.fn()} />);

        expect(screen.queryByRole('dialog')).toBeNull();
    });
});

describe('buildTodoUpdate', () => {
    const base = { title: todo.title, dueDate: '2026-11-02', priority: 'NORMAL' as const, description: '', groupId: '', dueTime: '', remind: 'default', assigneeId: '' };

    it('is empty when the form matches the todo', () => {
        expect(buildTodoUpdate(todo, base)).toEqual({});
    });

    it('moves a todo to a group and back to the whole site', () => {
        expect(buildTodoUpdate(todo, { ...base, groupId: '5' })).toEqual({ groupId: 5 });
        expect(buildTodoUpdate({ ...todo, groupId: 5 }, { ...base, groupId: '' })).toEqual({ groupId: null });
    });

    it('changes the priority', () => {
        expect(buildTodoUpdate(todo, { ...base, priority: 'URGENT' })).toEqual({ priority: 'URGENT' });
    });

    it('sets, changes and clears the time, the reminder and the assignee', () => {
        expect(buildTodoUpdate(todo, { ...base, dueTime: '14:30' })).toEqual({ dueTime: '14:30' });
        expect(buildTodoUpdate({ ...todo, dueTime: '14:30' }, { ...base, dueTime: '' })).toEqual({ dueTime: null });
        expect(buildTodoUpdate(todo, { ...base, remind: '60' })).toEqual({ remindBeforeMinutes: 60 });
        expect(buildTodoUpdate({ ...todo, remindBeforeMinutes: 60 }, { ...base, remind: 'default' })).toEqual({
            remindBeforeMinutes: null,
        });
        expect(buildTodoUpdate(todo, { ...base, assigneeId: '9' })).toEqual({ assigneeId: 9 });
        expect(buildTodoUpdate({ ...todo, assigneeId: 9 }, { ...base, assigneeId: '' })).toEqual({ assigneeId: null });
    });

    it('sets a due date on a todo that had none', () => {
        expect(buildTodoUpdate({ ...todo, dueDate: null }, { ...base, dueDate: '2026-12-01' })).toEqual({
            dueDate: '2026-12-01',
        });
    });
});
