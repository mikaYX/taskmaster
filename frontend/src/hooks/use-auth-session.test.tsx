import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from './use-auth';
import { useAuthStore } from '@/stores/auth-store';
import { authApi } from '@/api/auth';
import { ApiError } from '@/api/http';

vi.mock('@/api/auth', () => ({ authApi: { getSession: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return renderHook(() => useSession(), { wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.getState().clearSession();
    useAuthStore.getState().setSession(1, 'USER', [], []);
});

describe('password renewal session refresh', () => {
    it('reads the renewal flag from a flat response with a nested legacy user', async () => {
        vi.mocked(authApi.getSession).mockResolvedValue({ valid: true, mustChangePassword: true, user: { id: 1, username: 'operator', fullname: null, role: 'USER', permissions: [], passkeysEnabled: false, passkeyPolicy: 'disabled', hasPasskey: false } });
        const hook = setup();
        await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
        expect(useAuthStore.getState().mustChangePassword).toBe(true);
        expect(useAuthStore.getState().isLoading).toBe(false);
    });
    it('keeps the existing session during a transient background failure', async () => {
        vi.mocked(authApi.getSession).mockRejectedValue(new ApiError(503, 'Unavailable'));
        const hook = setup();
        await waitFor(() => expect(hook.result.current.isError).toBe(true));
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
        expect(useAuthStore.getState().isLoading).toBe(false);
    });
    it('clears the session when authentication has expired', async () => {
        vi.mocked(authApi.getSession).mockRejectedValue(new ApiError(401, 'Unauthorized'));
        const hook = setup();
        await waitFor(() => expect(hook.result.current.isError).toBe(true));
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
});
