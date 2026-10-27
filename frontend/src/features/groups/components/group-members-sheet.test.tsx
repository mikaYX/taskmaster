import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Group } from '@/api/types';
import { GroupMembersSheet } from './group-members-sheet';
import i18n from '@/lib/i18n';

const state = vi.hoisted(() => ({ setLead: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/hooks/use-users', () => ({ useUsers: () => ({ data: [] }) }));
vi.mock('@/hooks/use-groups', () => ({
    useGroupMembers: () => ({
        isLoading: false,
        data: [
            { id: 8, username: 'marie', fullname: 'Marie Dupont', email: 'marie@example.com', isLead: true },
            { id: 9, username: 'paul', fullname: 'Paul Martin', email: 'paul@example.com', isLead: false },
        ],
    }),
    useAddGroupMembers: () => ({ mutate: vi.fn(), isPending: false }),
    useRemoveGroupMembers: () => ({ mutate: vi.fn(), isPending: false }),
    useSetGroupLead: () => ({ mutate: state.setLead, isPending: false }),
}));

beforeEach(async () => {
    await i18n.changeLanguage('fr');
    state.setLead.mockReset();
});

const group = { id: 4, name: 'Maintenance' } as Group;

describe('GroupMembersSheet team leads', () => {
    it('marks the leads, and there can be several', () => {
        render(<GroupMembersSheet group={group} open onOpenChange={vi.fn()} />);

        expect(screen.getAllByText('Responsable')).toHaveLength(1);
        expect(screen.getByRole('button', { name: /Retirer Marie Dupont des responsables/ }).getAttribute('aria-pressed')).toBe('true');
        expect(screen.getByRole('button', { name: /Nommer Paul Martin responsable/ }).getAttribute('aria-pressed')).toBe('false');
    });

    it('appoints a second lead without touching the first', async () => {
        const user = userEvent.setup();
        render(<GroupMembersSheet group={group} open onOpenChange={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /Nommer Paul Martin responsable/ }));

        expect(state.setLead).toHaveBeenCalledWith({ id: 4, userId: 9, isLead: true }, expect.anything());
    });

    it('takes the lead role back', async () => {
        const user = userEvent.setup();
        render(<GroupMembersSheet group={group} open onOpenChange={vi.fn()} />);

        await user.click(screen.getByRole('button', { name: /Retirer Marie Dupont des responsables/ }));

        expect(state.setLead).toHaveBeenCalledWith({ id: 4, userId: 8, isLead: false }, expect.anything());
    });
});
