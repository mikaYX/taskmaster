import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasskeysManageDialog } from './passkeys-manage-dialog';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import * as webauthn from '@simplewebauthn/browser';

// Mock dependencies
vi.mock('@/api/auth', () => ({
    authApi: {
        listPasskeys: vi.fn(),
        generatePasskeyRegistrationOptions: vi.fn(),
        verifyPasskeyRegistration: vi.fn(),
        deletePasskey: vi.fn(),
    }
}));
vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

// Provide a stable ResizeObserver for shadcn/ui Dialog
globalThis.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

describe('PasskeysManageDialog', () => {
    let queryClient: QueryClient;

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        vi.clearAllMocks();
    });

    const renderComponent = () =>
        render(
            <QueryClientProvider client={queryClient}>
                <PasskeysManageDialog open={true} onOpenChange={() => { }} isEnforced={false} hasExistingPasskeys={false} />
            </QueryClientProvider>
        );

    it('lists passkeys successfully', async () => {
        vi.mocked(authApi.listPasskeys).mockResolvedValue([
            { id: '1', name: 'My MacBook', deviceType: 'singleDevice', backedUp: true, createdAt: new Date().toISOString(), lastUsedAt: null }
        ]);

        renderComponent();

        expect(screen.getByText('Manage Passkeys')).toBeDefined();
        await waitFor(() => {
            expect(screen.getByText('My MacBook')).toBeDefined();
        });
    });

    it('adds a passkey successfully', async () => {
        vi.mocked(authApi.listPasskeys).mockResolvedValue([]);
        vi.mocked(authApi.generatePasskeyRegistrationOptions).mockResolvedValue({ challenge: 'test' });
        vi.mocked(webauthn.startRegistration).mockResolvedValue({ id: 'new-key' } as unknown as webauthn.RegistrationResponseJSON);
        vi.mocked(authApi.verifyPasskeyRegistration).mockResolvedValue({ verified: true });

        renderComponent();

        await waitFor(() => screen.getByText('No passkeys configured'));

        fireEvent.click(screen.getByText('Add Passkey'));
        await waitFor(() => screen.getByText('Create Passkey'));

        const nameInput = screen.getByLabelText('Passkey Name');
        await userEvent.type(nameInput, 'Work PC');

        fireEvent.click(screen.getByText('Create Passkey'));

        await waitFor(() => {
            expect(authApi.generatePasskeyRegistrationOptions).toHaveBeenCalled();
            expect(webauthn.startRegistration).toHaveBeenCalled();
            expect(authApi.verifyPasskeyRegistration).toHaveBeenCalledWith({
                response: { id: 'new-key' },
                name: 'Work PC'
            });
        });
    });

    it('deletes a passkey successfully', async () => {
        vi.mocked(authApi.listPasskeys).mockResolvedValue([
            { id: '123', name: 'Old Key', deviceType: 'singleDevice', backedUp: true, createdAt: new Date().toISOString(), lastUsedAt: null }
        ]);
        vi.mocked(authApi.deletePasskey).mockResolvedValue({ success: true });

        renderComponent();

        await waitFor(() => screen.getByText('Old Key'));

        // Assuming there is a delete button (Trash icon) per passkey
        const deleteButton = screen.getByRole('button', { name: '' });
        fireEvent.click(deleteButton);

        // Delete confirmation
        await waitFor(() => screen.getByText('Remove Passkey?'));
        fireEvent.click(screen.getByText('Remove'));

        await waitFor(() => {
            expect(authApi.deletePasskey).toHaveBeenCalledWith('123');
        });
    });
});
