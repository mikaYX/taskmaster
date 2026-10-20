import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Todo } from '@/api/todos';
import { TodoItem } from './todo-item';
import i18n from '@/lib/i18n';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

const todo: Todo = {
    id: 1,
    title: 'Préparer la visite',
    isCompleted: false,
    completedAt: null,
    dueDate: null,
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

const collective: Todo = { ...todo, scope: 'COLLECTIVE' };
const person = { id: 9, username: 'marie', fullname: 'Marie Durand' };

describe('TodoItem collective', () => {
    it('lets anyone take an unassigned todo', async () => {
        const onTake = vi.fn();
        const { user } = setup({ todo: collective, canManage: false, currentUserId: 9, onTake, onRelease: vi.fn() });

        await user.click(screen.getByRole('button', { name: 'Je prends' }));

        expect(onTake).toHaveBeenCalledWith(collective);
    });

    it('shows who is in charge and lets that person give it back', async () => {
        const onRelease = vi.fn();
        const taken = { ...collective, assigneeId: 9, assignee: person };
        const { user } = setup({ todo: taken, canManage: false, currentUserId: 9, onTake: vi.fn(), onRelease });

        expect(screen.getByText('Vous')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Je prends' })).toBeNull();
        await user.click(screen.getByRole('button', { name: 'Libérer' }));

        expect(onRelease).toHaveBeenCalledWith(taken);
    });

    it("names someone else's assignee and hides the release button from other members", () => {
        const taken = { ...collective, assigneeId: 9, assignee: person };
        setup({ todo: taken, canManage: false, currentUserId: 3, onTake: vi.fn(), onRelease: vi.fn() });

        expect(screen.getByText('Marie Durand')).toBeTruthy();
        expect(screen.queryByRole('button', { name: 'Libérer' })).toBeNull();
    });

    it('opens the comments and files, with their count', async () => {
        const onOpenDetails = vi.fn();
        const busy = { ...todo, _count: { comments: 2, attachments: 1 } };
        const { user } = setup({ todo: busy, onOpenDetails });

        expect(screen.getByText('3')).toBeTruthy();
        await user.click(screen.getByRole('button', { name: 'Commentaires et fichiers' }));

        expect(onOpenDetails).toHaveBeenCalledWith(busy);
    });

    it('shows the time of day next to the due date', () => {
        const due = new Date();
        due.setUTCHours(0, 0, 0, 0);
        setup({ todo: { ...todo, dueDate: due.toISOString(), dueTime: '14:30' } });

        expect(screen.getByText("Aujourd'hui 14:30")).toBeTruthy();
    });

    it('reorders with Alt + arrow keys from the handle', async () => {
        const onMove = vi.fn();
        const drag = {
            dragging: false,
            over: false,
            onDragStart: vi.fn(),
            onDragEnd: vi.fn(),
            onDragOver: vi.fn(),
            onDrop: vi.fn(),
            onMove,
        };
        const { user } = setup({ drag });

        screen.getByRole('button', { name: /Déplacer/ }).focus();
        await user.keyboard('{Alt>}{ArrowDown}{/Alt}');

        expect(onMove).toHaveBeenCalledWith(1);
    });
});

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
