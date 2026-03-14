import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/api';
import { useAuthStore } from '@/stores';
import type { LoginDto, UserRole, UserSite, VerifyMfaLoginDto, AuthTokens } from '@/api/types';

/**
 * Query keys for auth.
 */
export const authKeys = {
    session: ['auth', 'session'] as const,
};

/**
 * Hook to fetch current session.
 *
 * Automatically updates auth store on success/failure.
 *
 * @param enabled - Whether to automatically fetch the session (default: true)
 */
function normalizeSession(session: any): { id: number; role: UserRole; groups: number[], permissions: string[], sites: UserSite[], passkeysEnabled: boolean, passkeyPolicy: 'disabled' | 'optional' | 'required', hasPasskey: boolean } | null {
    if (!session || !session.valid) return null;

    const userSource = session.user || session;
    const id = userSource.id ?? session.id;
    const role = userSource.role ?? session.role;

    if (id === undefined || !role) {
        console.error('Session valid but missing required fields (id/role). Force logout.');
        return null;
    }

    let groups: number[] = [];
    if (session.user?.groupIds && Array.isArray(session.user.groupIds)) {
        groups = session.user.groupIds;
    } else if (session.groupIds && Array.isArray(session.groupIds)) {
        groups = session.groupIds;
    } else if (Array.isArray(session.groups) && session.groups.length > 0 && session.groups.every((g: any) => typeof g === 'number')) {
        groups = session.groups;
    } else if (session.user?.groups && Array.isArray(session.user.groups)) {
        groups = session.user.groups.filter((g: any) => typeof g === 'number');
    } else if (Array.isArray(session.groups)) {
        groups = session.groups.filter((g: any) => typeof g === 'number');
    }

    let permissions: string[] = [];
    if (session.user?.permissions && Array.isArray(session.user.permissions)) {
        permissions = session.user.permissions;
    } else if (session.permissions && Array.isArray(session.permissions)) {
        permissions = session.permissions;
    }

    let sites: UserSite[] = [];
    const rawSites = session.user?.sites || session.sites;
    if (Array.isArray(rawSites)) {
        sites = rawSites.map((s: any) => ({
            siteId: s.siteId,
            siteName: s.siteName,
            siteCode: s.siteCode,
            isDefault: s.isDefault ?? false,
        }));
    }

    const passkeysEnabled = userSource.passkeysEnabled ?? false;
    const passkeyPolicy = userSource.passkeyPolicy ?? 'disabled';
    const hasPasskey = userSource.hasPasskey ?? false;

    return { id, role: role as UserRole, groups, permissions, sites, passkeysEnabled, passkeyPolicy, hasPasskey };
}

/**
 * Hook to fetch current session.
 *
 * Automatically updates auth store on success/failure.
 *
 * @param enabled - Whether to automatically fetch the session (default: true)
 */
export function useSession(enabled: boolean = true) {
    const setSession = useAuthStore((state) => state.setSession);
    const clearSession = useAuthStore((state) => state.clearSession);
    const setLoading = useAuthStore((state) => state.setLoading);

    return useQuery({
        queryKey: authKeys.session,
        queryFn: async () => {
            setLoading(true);
            try {
                const session = await authApi.getSession();
                const normalized = normalizeSession(session);

                if (normalized) {
                    setSession(normalized.id, normalized.role, normalized.groups, normalized.permissions, normalized.sites, normalized.passkeysEnabled, normalized.passkeyPolicy, normalized.hasPasskey);
                } else {
                    clearSession();
                }
                return session;
            } catch {
                clearSession();
                throw new Error('Session expired');
            }
        },
        enabled,
        retry: false,
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
}

/**
 * Hook for login mutation.
 */
export function useLogin() {
    const queryClient = useQueryClient();
    const setSession = useAuthStore((state) => state.setSession);

    return useMutation({
        mutationFn: (dto: LoginDto) => authApi.login(dto),
        onSuccess: async (data) => {
            if ('requiresMfa' in data && data.requiresMfa) {
                return; // Let the component handle MFA flow
            }
            // Store access token — refresh token is set as HttpOnly cookie by the backend
            if ('accessToken' in data && data.accessToken) {
                localStorage.setItem('accessToken', data.accessToken);
            }

            // Refetch session after login
            const session = await authApi.getSession();
            const normalized = normalizeSession(session);

            if (normalized) {
                setSession(normalized.id, normalized.role, normalized.groups, normalized.permissions, normalized.sites, normalized.passkeysEnabled, normalized.passkeyPolicy, normalized.hasPasskey);
            }

            queryClient.invalidateQueries({ queryKey: authKeys.session });
        },
    });
}

/**
 * Hook for verifying MFA and completing login.
 */
export function useVerifyMfaLogin() {
    const queryClient = useQueryClient();
    const setSession = useAuthStore((state) => state.setSession);

    return useMutation({
        mutationFn: (dto: VerifyMfaLoginDto) => authApi.verifyMfa(dto),
        onSuccess: async (data: AuthTokens) => {
            // Store access token — refresh token is set as HttpOnly cookie by the backend
            if (data.accessToken) {
                localStorage.setItem('accessToken', data.accessToken);
            }

            const session = await authApi.getSession();
            const normalized = normalizeSession(session);

            if (normalized) {
                setSession(normalized.id, normalized.role, normalized.groups, normalized.permissions, normalized.sites, normalized.passkeysEnabled, normalized.passkeyPolicy, normalized.hasPasskey);
            }

            queryClient.invalidateQueries({ queryKey: authKeys.session });
        },
    });
}

/**
 * Hook for Passkey login.
 */
export function usePasskeyLogin() {
    const queryClient = useQueryClient();
    const setSession = useAuthStore((state) => state.setSession);

    return useMutation({
        mutationFn: async () => {
            const { startAuthentication } = await import('@simplewebauthn/browser');
            const { options, sessionId } = await authApi.generatePasskeyAuthenticationOptions();
            const attResp = await startAuthentication(options);
            return authApi.verifyPasskeyAuthentication(attResp, sessionId);
        },
        onSuccess: async (data: AuthTokens) => {
            // Store access token — refresh token is set as HttpOnly cookie by the backend
            if (data.accessToken) {
                localStorage.setItem('accessToken', data.accessToken);
            }

            const session = await authApi.getSession();
            const normalized = normalizeSession(session);

            if (normalized) {
                setSession(normalized.id, normalized.role, normalized.groups, normalized.permissions, normalized.sites, normalized.passkeysEnabled, normalized.passkeyPolicy, normalized.hasPasskey);
            }

            queryClient.invalidateQueries({ queryKey: authKeys.session });
        },
    });
}

/**
 * Hook for logout mutation.
 */
export function useLogout() {
    const queryClient = useQueryClient();
    const clearSession = useAuthStore((state) => state.clearSession);

    return useMutation({
        mutationFn: () => authApi.logout(),
        onSuccess: () => {
            localStorage.removeItem('accessToken');
            clearSession();
            queryClient.clear();
        },
        onError: () => {
            // Clear session even on error
            localStorage.removeItem('accessToken');
            clearSession();
            queryClient.clear();
        },
    });
}
