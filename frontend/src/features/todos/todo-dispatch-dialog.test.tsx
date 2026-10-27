import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DispatchTeam, Todo } from '@/api/todos';
import { TodoDispatchDialog } from './todo-dispatch-dialog';
import i18n from '@/lib/i18n';

beforeAll(async () => {
    await i18n.changeLanguage('fr');
});

const todo = {
    id: 4,
    title: 'Contrôler la chaudière',
    isCompleted: false,
    scope: 'COLLECTIVE',
    priority: 'NORMAL',
    assigneeId: null,
    parentId: null,
    groupId: 4,
} as Todo;

const TEAMS: DispatchTeam[] = [
    {
        id: 4,
        name: 'Maintenance',
        memberCount: 2,
        members: [
            { id: 8, username: 'marie', fullname: 'Marie Dupont' },
            { id: 9, username: 'paul', fullname: null },
        ],
    },
    { id: 5, name: 'Qualité', memberCount: 1, members: [{ id: 20, username: 'lea', fullname: 'Léa Martin' }] },
];

function setup(overrides: Partial<Parameters<typeof TodoDispatchDialog>[0]> = {}) {
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<TodoDispatchDialog todo={todo} teams={TEAMS} onSave={onSave} onClose={onClose} {...overrides} />);
    return { onSave, onClose, user: userEvent.setup() };
}

describe('TodoDispatchDialog', () => {
    it('cannot be confirmed before a choice is made', () => {
        setup();

        expect((screen.getByRole('button', { name: 'Dispatcher' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it("hands the todo to a member of its team, and offers nobody from another team", async () => {
        const { onSave, user } = setup();

        await user.click(screen.getByRole('combobox', { name: 'Confier à' }));
        expect(screen.queryByRole('option', { name: /Léa Martin/ })).toBeNull();
        expect(screen.queryByRole('option', { name: /Qualité/ })).toBeNull();
        await user.click(screen.getByRole('option', { name: 'Marie Dupont' }));
        await user.click(screen.getByRole('button', { name: 'Dispatcher' }));

        expect(onSave).toHaveBeenCalledWith(4, { assigneeId: 8 });
    });

    it('offers every team the lead has when the todo is held in person without a team', async () => {
        const { onSave, user } = setup({ todo: { ...todo, groupId: null, assigneeId: 8 } });

        await user.click(screen.getByRole('combobox', { name: 'Confier à' }));
        await user.click(screen.getByRole('option', { name: /Qualité/ }));
        await user.click(screen.getByRole('button', { name: 'Dispatcher' }));

        expect(onSave).toHaveBeenCalledWith(4, { groupId: 5, assigneeId: null });
    });

    it('renders nothing without a todo', () => {
        const { container } = render(<TodoDispatchDialog todo={null} teams={TEAMS} onSave={vi.fn()} onClose={vi.fn()} />);

        expect(container.textContent).toBe('');
    });
});
