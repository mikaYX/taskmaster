import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
const { storage } = vi.hoisted(() => {
    const storage = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => { storage.set(key, value); },
        removeItem: (key: string) => { storage.delete(key); },
        clear: () => { storage.clear(); },
        key: (index: number) => Array.from(storage.keys())[index] ?? null,
        get length() { return storage.size; },
    } satisfies Storage);
    return { storage };
});
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

describe('LoginPage', () => {
    let queryClient: QueryClient;

    beforeAll(() => {
        window.alert = vi.fn();
    });

    beforeEach(() => {
        queryClient = new QueryClient({
            defaultOptions: { queries: { retry: false } },
        });
        storage.clear();
        vi.clearAllMocks();
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
                expiresIn: 900,
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
                expect(authApi.exchangeSsoTicket).toHaveBeenCalledWith('test-ticket');
                expect(replaceSpy).toHaveBeenCalledWith('/');
            });
        });

        it('should NOT read access_token or refresh_token from URL', async () => {
            renderWithRouter(['/login?access_token=leaked&refresh_token=leaked']);

            // Give effects time to run and wrap in act to avoid warnings
            await waitFor(() => new Promise(r => setTimeout(r, 50)));

            expect(authApi.exchangeSsoTicket).not.toHaveBeenCalled();
        });
    });

    describe('URL credentials (AUDIT.md Finding #1 — fully removed)', () => {
        it('MUST NOT call POST /auth/login when the URL carries ?u=&p=', async () => {
            renderWithRouter(['/login?u=admin&p=hunter2']);

            // Allow effects + react-query to settle
            await waitFor(() => new Promise(r => setTimeout(r, 100)));

            expect(authApi.login).not.toHaveBeenCalled();
            expect(authApi.exchangeSsoTicket).not.toHaveBeenCalled();
        });

        it('MUST NOT pre-fill the username field from ?u=', async () => {
            renderWithRouter(['/login?u=admin&p=hunter2']);

            const input = await screen.findByLabelText(/auth\.username/i) as HTMLInputElement;
            expect(input.value).toBe('');
        });

        it('MUST NOT call POST /auth/login for the legacy ?u-/p- variants', async () => {
            renderWithRouter(['/login?u-admin&p-hunter2']);

            await waitFor(() => new Promise(r => setTimeout(r, 100)));

            expect(authApi.login).not.toHaveBeenCalled();
        });
    });
});
