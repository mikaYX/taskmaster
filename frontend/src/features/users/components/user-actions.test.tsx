import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { User } from '@/api/types';
import { UserActions } from './user-actions';

vi.mock('@/hooks/use-users', () => ({
    useDeleteUser: () => ({ mutate: vi.fn() }),
    useRestoreUser: () => ({ mutate: vi.fn() }),
}));

const baseUser = {
    id: 3,
    username: 'jane@example.com',
    fullname: 'Jane Doe',
    email: 'jane@example.com',
    role: 'USER',
    deletedAt: null,
} as unknown as User;

async function openMenu(user: User) {
    render(<UserActions user={user} onEdit={vi.fn()} onResetPassword={vi.fn()} />);
    await userEvent.setup().click(screen.getByRole('button'));
}

const entries = () => screen.getAllByRole('menuitem').map((item) => item.textContent?.trim());

describe('UserActions menu', () => {
    it('offers edit, password reset and delete for an active account', async () => {
        await openMenu(baseUser);

        expect(entries()).toEqual(['Edit', 'Reset Password', 'Delete']);
    });

    it('offers only Restore for a deleted account: no edit, and no password to hand out', async () => {
        await openMenu({ ...baseUser, deletedAt: '2026-10-01T10:00:00.000Z' } as User);

        expect(entries()).toEqual(['Restore']);
    });

    it('leaves guest links to their own dialog', async () => {
        await openMenu({ ...baseUser, role: 'GUEST' } as User);

        expect(entries().join(' ')).not.toMatch(/Edit|Reset|Delete|Restore/);
    });
});
