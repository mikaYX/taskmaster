import { render, screen } from '@testing-library/react';
import { GuestLinkDialog } from './guest-link-dialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect } from 'vitest';

// Mocks
vi.mock('@/hooks/use-sites', () => ({
    useSites: () => ({
        data: [
            { id: 1, name: 'Main Site', code: 'MAIN' },
            { id: 2, name: 'Second Site', code: 'SECOND' }
        ],
        isLoading: false
    })
}));

vi.mock('@/hooks/use-users', () => ({
    useUsers: () => ({
        data: [],
        isLoading: false,
    }),
    useCreateUser: () => ({ mutate: vi.fn() }),
    useDeleteUser: () => ({ mutate: vi.fn() }),
    useResetPassword: () => ({ mutate: vi.fn() }),
    useGuests: () => ({
        data: [
            {
                id: 10,
                username: 'guest_site_1',
                role: 'GUEST',
                fullname: 'TV Link - Main Site',
                deletedAt: null,
                sites: [{ siteId: 1 }],
            },
        ],
        isLoading: false,
    }),
    useCreateGuest: () => ({ mutate: vi.fn(), isPending: false }),
    useRevokeGuest: () => ({ mutate: vi.fn(), isPending: false }),
    useRegenerateGuestPassword: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('GuestLinkDialog', () => {
    const queryClient = new QueryClient();

    const renderComponent = (open = true) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <GuestLinkDialog open={open} onOpenChange={vi.fn()} />
            </QueryClientProvider>
        );
    };

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

    it('shows "Active" badge for site with existing guest', () => {
        renderComponent();
        const activeBadges = screen.getAllByText('Active');
        expect(activeBadges.length).toBeGreaterThan(0);
    });

    it('shows "Create Link" button for site without guest', () => {
        renderComponent();
        expect(screen.getByText('Create Link')).toBeDefined();
    });
});
