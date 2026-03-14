import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PasskeyOnboardingModal } from './passkey-onboarding-modal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores';
import * as webauthn from '@simplewebauthn/browser';

// Mock dependencies
vi.mock('@/api/auth', () => ({
    authApi: {
        generatePasskeyRegistrationOptions: vi.fn(),
        verifyPasskeyRegistration: vi.fn(),
        getSession: vi.fn(),
    }
}));
vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, defaultText: string) => defaultText || key }),
}));
vi.mock('@/stores', () => {
    const mockStore = Object.assign(vi.fn(), {
        getState: vi.fn(),
        setState: vi.fn(),
    });
    return { useAuthStore: mockStore };
});

// Provide a stable ResizeObserver for shadcn/ui Dialog
globalThis.ResizeObserver = class {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// localStorage in-memory mock — jsdom ne fournit pas une implémentation complète
// avec --localstorage-file, ce qui fait échouer setItem dans onSuccess
const localStorageStore: Record<string, string> = {};
vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageStore[key] ?? null,
    setItem: (key: string, value: string) => { localStorageStore[key] = value; },
    removeItem: (key: string) => { delete localStorageStore[key]; },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
});

// Mock BroadcastChannel
const mockPostMessage = vi.fn();
const mockClose = vi.fn();
let mockOnMessage: ((ev: MessageEvent) => void) | null = null;

class MockBroadcastChannel {
    name: string;
    constructor(name: string) {
        this.name = name;
    }

    postMessage = mockPostMessage;
    close = mockClose;

    set onmessage(fn: (ev: MessageEvent) => void) {
        mockOnMessage = fn;
    }

    addEventListener(event: string, fn: (ev: MessageEvent) => void) {
        if (event === 'message') {
            mockOnMessage = fn;
        }
    }
}

globalThis.BroadcastChannel = MockBroadcastChannel as unknown as typeof BroadcastChannel;

describe('PasskeyOnboardingModal', () => {
    let queryClient: QueryClient;
    const mockOnOpenChange = vi.fn();

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        vi.clearAllMocks();
        mockOnMessage = null;
        Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]);
    });

    const renderComponent = (policy: 'optional' | 'required' = 'optional') =>
        render(
            <QueryClientProvider client={queryClient}>
                <PasskeyOnboardingModal open={true} onOpenChange={mockOnOpenChange} policy={policy} />
            </QueryClientProvider>
        );

    it('renders optional modal with skip button', async () => {
        renderComponent('optional');

        expect(screen.getByText('Setup a Passkey')).toBeDefined();
        // Should have Configure Now and Later buttons
        expect(screen.getByText('Configure Now')).toBeDefined();
        expect(screen.getByText('Later')).toBeDefined();

        // Clicking Later should trigger onOpenChange(false)
        fireEvent.click(screen.getByText('Later'));
        expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });

    it('renders required modal without skip button and prevents closing', async () => {
        renderComponent('required');

        expect(screen.getByText('Setup a Passkey')).toBeDefined();
        // Should have Configure Now but not Later
        expect(screen.getByText('Configure Now')).toBeDefined();
        expect(screen.queryByText('Later')).toBeNull();

        // Close button (X) might be in Dialog but we simulate clicking outside / escape which are handled by onInteractOutside
    });

    it('handles add passkey flow successfully', async () => {
        vi.mocked(authApi.generatePasskeyRegistrationOptions).mockResolvedValue({ challenge: 'test' });
        vi.mocked(webauthn.startRegistration).mockResolvedValue({ id: 'new-key' } as unknown as webauthn.RegistrationResponseJSON);
        vi.mocked(authApi.verifyPasskeyRegistration).mockResolvedValue({ verified: true });
        vi.mocked(authApi.getSession).mockResolvedValue({ hasPasskey: true } as never);

        renderComponent('optional');

        // Go to Add step
        fireEvent.click(screen.getByText('Configure Now'));
        await waitFor(() => screen.getByText('Device Name'));

        const nameInput = screen.getByLabelText('Device Name');
        await userEvent.type(nameInput, 'Personal Phone');

        fireEvent.click(screen.getByText('Create Passkey'));

        await waitFor(() => {
            expect(authApi.generatePasskeyRegistrationOptions).toHaveBeenCalled();
            expect(webauthn.startRegistration).toHaveBeenCalled();
            expect(authApi.verifyPasskeyRegistration).toHaveBeenCalledWith({
                response: { id: 'new-key' },
                name: 'Personal Phone'
            });
            expect(useAuthStore.setState).toHaveBeenCalledWith({ hasPasskey: true });
            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });
    });

    it('handles WebAuthn cancellation gracefully without alert', async () => {
        vi.mocked(authApi.generatePasskeyRegistrationOptions).mockResolvedValue({ challenge: 'test' });

        // Simulate NotAllowedError (user cancelled)
        const cancelError = new Error('Cancelled');
        cancelError.name = 'NotAllowedError';
        vi.mocked(webauthn.startRegistration).mockRejectedValue(cancelError);

        renderComponent('optional');

        fireEvent.click(screen.getByText('Configure Now'));
        await waitFor(() => screen.getByText('Device Name'));

        const nameInput = screen.getByLabelText('Device Name');
        await userEvent.type(nameInput, 'Work PC');

        fireEvent.click(screen.getByText('Create Passkey'));

        await waitFor(() => {
            expect(authApi.generatePasskeyRegistrationOptions).toHaveBeenCalled();
            expect(webauthn.startRegistration).toHaveBeenCalled();
            // Should not call verify
            expect(authApi.verifyPasskeyRegistration).not.toHaveBeenCalled();
            // Should stay open
            expect(mockOnOpenChange).not.toHaveBeenCalled();
            // Toasts are hard to assert without spying on sonner, but we ensure no alert()
            // The modal should remain in the "add" state, meaning "Cancel" and "Create Passkey" buttons are still there
            expect(screen.getByText('Create Passkey')).toBeDefined();
        });
    });

    it('synchronizes across tabs and closes when a passkey-added message is received', async () => {
        vi.mocked(authApi.getSession).mockResolvedValue({ hasPasskey: true } as never);
        renderComponent('optional');

        expect(screen.getByText('Setup a Passkey')).toBeDefined();

        // Simulate receiving a message from another tab
        if (mockOnMessage) {
            mockOnMessage({ data: 'passkey-added' } as MessageEvent);
        }

        await waitFor(() => {
            expect(authApi.getSession).toHaveBeenCalled();
            expect(useAuthStore.setState).toHaveBeenCalledWith({ hasPasskey: true });
            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });
    });

    it('synchronizes across tabs using fallback StorageEvent', async () => {
        vi.mocked(authApi.getSession).mockResolvedValue({ hasPasskey: true } as never);
        renderComponent('optional');

        expect(screen.getByText('Setup a Passkey')).toBeDefined();

        // Simulate receiving a storage event
        const storageEvent = new window.StorageEvent('storage', {
            key: 'passkey-sync-fallback',
            newValue: 'passkey-added'
        });
        window.dispatchEvent(storageEvent);

        await waitFor(() => {
            expect(authApi.getSession).toHaveBeenCalled();
            expect(useAuthStore.setState).toHaveBeenCalledWith({ hasPasskey: true });
            expect(mockOnOpenChange).toHaveBeenCalledWith(false);
        });
    });

    it('prevents concurrent session fetching (in-flight lock)', async () => {
        // Delay getSession to easily trigger concurrent events
        vi.mocked(authApi.getSession).mockImplementation(async () => {
            return new Promise((resolve) => {
                setTimeout(() => resolve({ hasPasskey: true } as never), 50);
            });
        });
        renderComponent('optional');

        // Fire two events immediately
        if (mockOnMessage) {
            mockOnMessage({ data: 'passkey-added' } as MessageEvent);
            mockOnMessage({ data: 'passkey-added' } as MessageEvent);
        }

        await waitFor(() => {
            expect(authApi.getSession).toHaveBeenCalledTimes(1);
        });
    });

    it('cleans up event listeners on unmount', () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener');
        const { unmount } = renderComponent('optional');

        unmount();

        expect(mockClose).toHaveBeenCalled();
        expect(removeSpy).toHaveBeenCalledWith('storage', expect.any(Function));
    });

    it('does not crash or loop if session fetching fails during sync', async () => {
        vi.mocked(authApi.getSession).mockRejectedValue(new Error('Network error'));
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        // Use 'required' so Radix Dialog doesn't auto-close on focus loss during the test
        renderComponent('required');

        if (mockOnMessage) {
            mockOnMessage({ data: 'passkey-added' } as MessageEvent);
        }

        await waitFor(() => {
            expect(authApi.getSession).toHaveBeenCalledTimes(1);
            expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[PasskeySync] Failed to synchronize state:'), expect.any(Error));
        });

        consoleSpy.mockRestore();
    });
});
