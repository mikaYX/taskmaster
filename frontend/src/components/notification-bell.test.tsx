import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InboxItem } from '@/api/types';
import { NotificationBell } from './notification-bell';

const inbox = vi.hoisted(() => ({ data: undefined as { items: unknown[]; unread: number } | undefined }));
const markRead = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const navigate = vi.hoisted(() => vi.fn());

vi.mock('@/hooks/use-todos', () => ({ useInbox: () => inbox, useMarkInboxRead: () => markRead }));
vi.mock('react-router-dom', async (original) => ({
    ...(await original<typeof import('react-router-dom')>()),
    useNavigate: () => navigate,
}));

const item = (over: Partial<InboxItem>): InboxItem => ({
    id: 1,
    type: 'TODO_DUE',
    title: 'Appeler le prestataire',
    body: 'Échéance demain',
    url: '/todos',
    readAt: null,
    createdAt: new Date().toISOString(),
    ...over,
});

function setup() {
    render(
        <MemoryRouter>
            <NotificationBell />
        </MemoryRouter>,
    );
    return userEvent.setup();
}

describe('NotificationBell', () => {
    beforeEach(() => {
        inbox.data = { items: [], unread: 0 };
        markRead.mutate.mockReset();
        navigate.mockReset();
    });

    it('shows the unread count on the bell and an empty state in the panel', async () => {
        const user = setup();
        expect(screen.queryByTestId('inbox-unread')).toBeNull();

        await user.click(screen.getByRole('button', { name: 'Notifications (0 unread)' }));

        expect(screen.getByText('No notifications')).toBeTruthy();
    });

    it('marks a notification as read and opens what it is about', async () => {
        inbox.data = { items: [item({ id: 5 }), item({ id: 6, title: 'Lue', readAt: new Date().toISOString() })], unread: 1 };
        const user = setup();
        expect(screen.getByTestId('inbox-unread').textContent).toBe('1');

        await user.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
        await user.click(screen.getByText('Appeler le prestataire'));

        expect(markRead.mutate).toHaveBeenCalledWith(5);
        expect(navigate).toHaveBeenCalledWith('/todos');
    });

    it('opens the exact todo and comment a notification points at, and keeps old list links', async () => {
        inbox.data = {
            items: [
                item({ id: 5, url: '/todos?todoId=12&commentId=40' }),
                item({ id: 6, title: 'Ancienne notification', url: '/todos' }),
            ],
            unread: 2,
        };
        const user = setup();

        await user.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
        await user.click(screen.getByText('Appeler le prestataire'));
        expect(navigate).toHaveBeenLastCalledWith('/todos?todoId=12&commentId=40');

        await user.click(screen.getByRole('button', { name: 'Notifications (2 unread)' }));
        await user.click(screen.getByText('Ancienne notification'));
        expect(navigate).toHaveBeenLastCalledWith('/todos');
    });

    it('does not mark an already read notification again', async () => {
        inbox.data = { items: [item({ id: 6, readAt: new Date().toISOString() })], unread: 0 };
        const user = setup();

        await user.click(screen.getByRole('button', { name: 'Notifications (0 unread)' }));
        await user.click(screen.getByText('Appeler le prestataire'));

        expect(markRead.mutate).not.toHaveBeenCalled();
    });

    it('marks everything as read in one click', async () => {
        inbox.data = { items: [item({ id: 5 })], unread: 1 };
        const user = setup();

        await user.click(screen.getByRole('button', { name: 'Notifications (1 unread)' }));
        await user.click(screen.getByRole('button', { name: 'Mark all as read' }));

        expect(markRead.mutate).toHaveBeenCalledWith('all');
    });
});
