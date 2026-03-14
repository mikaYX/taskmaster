import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { LoginPage } from './login-page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { authApi } from '@/api/auth';
import * as webauthn from '@simplewebauthn/browser';

vi.mock('@/api/auth', () => ({
    authApi: {
        login: vi.fn(),
        verifyMfa: vi.fn(),
        generatePasskeyAuthenticationOptions: vi.fn(),
        verifyPasskeyAuthentication: vi.fn(),
        getSession: vi.fn().mockResolvedValue({ id: 1, role: 'USER', valid: true }),
        exchangeSsoTicket: vi.fn(),
    }
}));
vi.mock('@simplewebauthn/browser', () => ({
    startAuthentication: vi.fn(),
}));
vi.mock('@/api/settings', () => ({
    settingsApi: {
        getPublicBranding: vi.fn().mockResolvedValue({
            'app.title': 'Taskmaster',
            'auth.passkeys.enabled': 'true'
        }),
    }
}));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
}));

const mockStorage: Record<string, string> = {};
const localStorageMock = {
    getItem: vi.fn((key: string) => mockStorage[key] || null),
    setItem: vi.fn((key: string, value: string) => {
        mockStorage[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
        delete mockStorage[key];
    }),
    clear: vi.fn(() => {
        for (const key in mockStorage) delete mockStorage[key];
    }),
};
vi.stubGlobal('localStorage', localStorageMock);

describe('LoginPage', () => {
    let queryClient: QueryClient;

    beforeAll(() => {
        window.alert = vi.fn();
    });

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        vi.clearAllMocks();
        // Reset localStorage mock natively
        localStorageMock.clear();
    });

    const renderWithRouter = (initialEntries: string[] = ['/login']) =>
        render(
            <MemoryRouter initialEntries={initialEntries}>
                <QueryClientProvider client={queryClient}>
                    <LoginPage />
                </QueryClientProvider>
            </MemoryRouter>
        );

    describe('Passkey login flow', () => {
        it('handles passkey login flow successfully', async () => {
            vi.mocked(authApi.generatePasskeyAuthenticationOptions).mockResolvedValue({
                options: { challenge: 'auth-challenge' },
                sessionId: 'session123'
            });
            vi.mocked(webauthn.startAuthentication).mockResolvedValue({ id: 'key-123' } as unknown as webauthn.AuthenticationResponseJSON);
            vi.mocked(authApi.verifyPasskeyAuthentication).mockResolvedValue({
                accessToken: 'mock-access',
                refreshToken: 'mock-refresh'
            });

            renderWithRouter();

            const passkeyButton = await screen.findByRole('button', { name: /Sign in with Passkey/i });
            fireEvent.click(passkeyButton);

            await waitFor(() => {
                expect(authApi.generatePasskeyAuthenticationOptions).toHaveBeenCalled();
                expect(webauthn.startAuthentication).toHaveBeenCalledWith({ challenge: 'auth-challenge' });
                expect(authApi.verifyPasskeyAuthentication).toHaveBeenCalledWith(
                    { id: 'key-123' },
                    'session123'
                );
            });
        });
    });

    describe('SSO ticket exchange', () => {
        it('should call exchangeSsoTicket when sso_ticket is in URL', async () => {
            vi.mocked(authApi.exchangeSsoTicket).mockResolvedValue({
                accessToken: 'sso-access',
                refreshToken: 'sso-refresh',
                expiresIn: 900,
            });

            // Replace is called to navigate to /
            const replaceSpy = vi.fn();
            Object.defineProperty(window, 'location', {
                value: { ...window.location, replace: replaceSpy },
                writable: true,
            });

            renderWithRouter(['/login?sso_ticket=test-ticket']);

            await waitFor(() => {
                expect(window.localStorage.getItem('accessToken')).toEqual('sso-access');
                expect(window.localStorage.getItem('refreshToken')).toEqual('sso-refresh');
            });
        });

        it('should NOT read access_token or refresh_token from URL', async () => {
            renderWithRouter(['/login?access_token=leaked&refresh_token=leaked']);

            // Give effects time to run and wrap in act to avoid warnings
            await waitFor(() => new Promise(r => setTimeout(r, 50)));

            // access_token/refresh_token should NOT be stored
            expect(window.localStorage.getItem('accessToken')).toBeNull();
            expect(window.localStorage.getItem('refreshToken')).toBeNull();
            expect(authApi.exchangeSsoTicket).not.toHaveBeenCalled();
        });
    });
});
