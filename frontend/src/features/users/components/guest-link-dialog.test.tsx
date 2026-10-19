import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GuestLinkDialog } from './guest-link-dialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';

const hooks = vi.hoisted(() => ({
    create: vi.fn(),
    createLinkAsync: vi.fn(),
    regenerate: vi.fn(),
    revoke: vi.fn(),
}));

vi.mock('@/hooks/use-sites', () => ({
    useSites: () => ({
        data: [
            { id: 1, name: 'Main Site', code: 'MAIN' },
            { id: 2, name: 'Second Site', code: 'SECOND' },
        ],
        isLoading: false,
    }),
}));

vi.mock('@/hooks/use-users', () => ({
    useGuests: () => ({
        data: [
            {
                id: 10,
                username: 'guest_main_1',
                role: 'GUEST',
                guestView: null, // an account from before screens existed: the board
                fullname: 'TV Mode - Main Site',
                deletedAt: null,
                sites: [{ siteId: 1 }],
            },
        ],
        isLoading: false,
    }),
    useCreateGuest: () => ({ mutate: hooks.create, isPending: false }),
    useRevokeGuest: () => ({ mutate: hooks.revoke, isPending: false }),
    useRegenerateGuestPassword: () => ({ mutate: hooks.regenerate, isPending: false }),
    useCreateGuestLink: () => ({ mutateAsync: hooks.createLinkAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe('GuestLinkDialog', () => {
    const queryClient = new QueryClient();

    const renderComponent = (open = true) =>
        render(
            <QueryClientProvider client={queryClient}>
                <GuestLinkDialog open={open} onOpenChange={vi.fn()} />
            </QueryClientProvider>,
        );

    beforeEach(() => {
        hooks.create.mockReset();
        hooks.createLinkAsync.mockReset();
        hooks.regenerate.mockReset();
        hooks.revoke.mockReset();
        hooks.createLinkAsync.mockResolvedValue({ ticket: 'f'.repeat(64), expiresAt: '2026-10-20T10:00:00.000Z' });
    });

    it('renders the dialog title and description', () => {
        renderComponent();
        expect(screen.getByText('Guest TV Links')).toBeDefined();
        expect(screen.getByText(/Generate secure, read-only links/i)).toBeDefined();
    });

    it('displays the list of sites', () => {
        renderComponent();
        expect(screen.getByText('Main Site')).toBeDefined();
        expect(screen.getByText('Second Site')).toBeDefined();
    });

    it('shows the state of each screen of each site', () => {
        renderComponent();

        // Main Site has a board link (old account, no view); Second Site has nothing.
        expect(screen.getAllByText('Active')).toHaveLength(1);
        expect(screen.getAllByText('Not created')).toHaveLength(3);
        expect(screen.getByText('guest_main_1')).toBeDefined();
    });

    it('only offers to create what is missing, the board being ticked by default', () => {
        renderComponent();

        // Main Site already has the board: only analytics can be added.
        expect(screen.queryByRole('checkbox', { name: 'Dashboard link for Main Site' })).toBeNull();
        expect(screen.getByRole('checkbox', { name: 'Analytics link for Main Site' })).toBeDefined();

        const dashboard = screen.getByRole('checkbox', { name: 'Dashboard link for Second Site' });
        const analytics = screen.getByRole('checkbox', { name: 'Analytics link for Second Site' });
        expect(dashboard.getAttribute('aria-checked')).toBe('true');
        expect(analytics.getAttribute('aria-checked')).toBe('false');
    });

    describe('creating links', () => {
        it('creates the board link alone by default', async () => {
            renderComponent();

            await userEvent.setup().click(screen.getAllByRole('button', { name: 'Create link' })[1]);

            expect(hooks.create).toHaveBeenCalledWith({ siteId: 2, views: ['DASHBOARD'] }, expect.anything());
        });

        it('creates the analytics link alone when only that one is chosen', async () => {
            renderComponent();
            const user = userEvent.setup();

            await user.click(screen.getByRole('checkbox', { name: 'Dashboard link for Second Site' }));
            await user.click(screen.getByRole('checkbox', { name: 'Analytics link for Second Site' }));
            await user.click(screen.getAllByRole('button', { name: 'Create link' })[1]);

            expect(hooks.create).toHaveBeenCalledWith({ siteId: 2, views: ['ANALYTICS'] }, expect.anything());
        });

        it('creates both links with one click when both are chosen', async () => {
            renderComponent();
            const user = userEvent.setup();

            await user.click(screen.getByRole('checkbox', { name: 'Analytics link for Second Site' }));
            await user.click(screen.getByRole('button', { name: 'Create 2 links' }));

            expect(hooks.create).toHaveBeenCalledWith(
                { siteId: 2, views: ['DASHBOARD', 'ANALYTICS'] },
                expect.anything(),
            );
        });

        it('cannot create anything when no screen is chosen', async () => {
            renderComponent();

            await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Dashboard link for Second Site' }));

            const create = screen.getAllByRole('button', { name: 'Create link' })[1] as HTMLButtonElement;
            expect(create.disabled).toBe(true);
        });

        it('shows one one-time link per created screen', async () => {
            hooks.create.mockImplementation((_vars, options) =>
                options.onSuccess([
                    { id: 21, username: 'guest_second_1', guestView: 'DASHBOARD' },
                    { id: 22, username: 'guest_second_analytics_1', guestView: 'ANALYTICS' },
                ]),
            );
            renderComponent();
            const user = userEvent.setup();

            await user.click(screen.getByRole('checkbox', { name: 'Analytics link for Second Site' }));
            await user.click(screen.getByRole('button', { name: 'Create 2 links' }));

            expect(await screen.findByLabelText('One-time TV link, Second Site Dashboard')).toBeDefined();
            expect(await screen.findByLabelText('One-time TV link, Second Site Analytics')).toBeDefined();
            expect(hooks.createLinkAsync).toHaveBeenCalledWith(21);
            expect(hooks.createLinkAsync).toHaveBeenCalledWith(22);
        });
    });

    describe('one-time links', () => {
        it('shows a ticket link that carries no username or password', async () => {
            renderComponent();

            await userEvent.setup().click(screen.getByRole('button', { name: 'New Dashboard link for Main Site' }));

            const link = ((await screen.findByLabelText('One-time TV link, Main Site Dashboard')) as HTMLInputElement).value;
            expect(link).toContain('/login?guest_ticket=' + 'f'.repeat(64));
            expect(link).not.toMatch(/[?&](u|p)=/);
        });

        it('signs the screen out first when the access is reset, then offers a fresh link', async () => {
            hooks.regenerate.mockImplementation((_id, options) => options.onSuccess());
            renderComponent();

            await userEvent.setup().click(screen.getByRole('button', { name: 'Reset Dashboard access for Main Site' }));

            expect(hooks.regenerate).toHaveBeenCalledWith(10, expect.anything());
            expect(await screen.findByLabelText('One-time TV link, Main Site Dashboard')).toBeDefined();
        });

        it('revokes a link', async () => {
            renderComponent();

            await userEvent.setup().click(screen.getByRole('button', { name: 'Revoke Dashboard link for Main Site' }));

            expect(hooks.revoke).toHaveBeenCalledWith(10, expect.anything());
        });
    });
});
