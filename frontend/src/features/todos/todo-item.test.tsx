import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/api/todos';
import { TodoItem } from './todo-item';

const todo: Todo = {
    id: 1,
    title: 'Préparer la visite',
    isCompleted: false,
    completedAt: null,
    dueDate: null,
    scope: 'PRIVATE',
    priority: 'NORMAL',
    recurrence: 'NONE',
    description: null,
    parentId: null,
    completedBy: null,
    groupId: null,
    userId: 7,
    createdAt: '2026-10-19T10:00:00.000Z',
};

const subtask = (id: number, isCompleted: boolean): Todo => ({
    ...todo,
    id,
    title: `Étape ${id}`,
    parentId: 1,
    isCompleted,
});

function setup(props: Partial<Parameters<typeof TodoItem>[0]> = {}) {
    const actions = {
        onToggle: vi.fn(),
        onRename: vi.fn(),
        onEdit: vi.fn(),
        onDelete: vi.fn(),
        onAddSubtask: vi.fn(),
    };
    render(<TodoItem todo={todo} canManage {...actions} {...props} />);
    return { ...actions, user: userEvent.setup() };
}

describe('TodoItem', () => {
    it('shows subtask progress and reveals the subtasks on demand', async () => {
        const { user } = setup({ subtasks: [subtask(2, true), subtask(3, false)] });

        expect(screen.getByText('1/2')).toBeTruthy();
        expect(screen.queryByText('Étape 2')).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Afficher les sous-tâches' }));

        expect(screen.getByText('Étape 2')).toBeTruthy();
        expect(screen.getByText('Étape 3')).toBeTruthy();
    });

    it('adds a subtask from the expanded list', async () => {
        const { user, onAddSubtask } = setup();

        await user.click(screen.getByRole('button', { name: 'Afficher les sous-tâches' }));
        await user.type(screen.getByLabelText('Nouvelle sous-tâche'), 'Réserver la salle');
        await user.click(screen.getByRole('button', { name: 'Ajouter' }));

        expect(onAddSubtask).toHaveBeenCalledWith(todo, 'Réserver la salle');
    });

    it('renames on double-click and Enter', async () => {
        const { user, onRename } = setup();

        await user.dblClick(screen.getByText('Préparer la visite'));
        const input = screen.getByLabelText('Titre de la tâche');
        await user.clear(input);
        await user.type(input, 'Préparer la réunion{Enter}');

        expect(onRename).toHaveBeenCalledWith(todo, 'Préparer la réunion');
    });

    it('cancels a rename with Escape', async () => {
        const { user, onRename } = setup();

        await user.dblClick(screen.getByText('Préparer la visite'));
        await user.type(screen.getByLabelText('Titre de la tâche'), 'x{Escape}');

        expect(onRename).not.toHaveBeenCalled();
        expect(screen.getByText('Préparer la visite')).toBeTruthy();
    });

    it('lets a read-only viewer tick but not rename, edit or delete', async () => {
        const { user, onToggle, onRename } = setup({ canManage: false });

        expect(screen.queryByRole('button', { name: 'Modifier la tâche' })).toBeNull();
        expect(screen.queryByRole('button', { name: 'Supprimer la tâche' })).toBeNull();
        await user.dblClick(screen.getByText('Préparer la visite'));
        expect(onRename).not.toHaveBeenCalled();

        await user.click(screen.getByRole('checkbox'));
        expect(onToggle).toHaveBeenCalledWith(todo, true);
    });

    it('says who completed a collective todo', () => {
        setup({
            todo: {
                ...todo,
                isCompleted: true,
                completedBy: { id: 3, username: 'marie', fullname: 'Marie Dupont' },
            },
        });

        expect(screen.getByText('par Marie Dupont')).toBeTruthy();
    });
});
