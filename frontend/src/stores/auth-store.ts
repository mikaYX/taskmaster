import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserRole, UserSite } from '@/api/types';

interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    userId: number | null;
    role: UserRole | null;
    groups: number[];
    permissions: string[];
    sites: UserSite[];
    passkeysEnabled: boolean;
    passkeyPolicy: 'disabled' | 'optional' | 'required';
    hasPasskey: boolean;

    setSession: (
        userId: number,
        role: UserRole,
        groups: number[],
        permissions: string[],
        sites?: UserSite[],
        passkeysEnabled?: boolean,
        passkeyPolicy?: 'disabled' | 'optional' | 'required',
        hasPasskey?: boolean
    ) => void;
    clearSession: () => void;
    setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            isAuthenticated: false,
            isLoading: true,
            userId: null,
            role: null,
            groups: [],
            permissions: [],
            sites: [],
            passkeysEnabled: false,
            passkeyPolicy: 'disabled',
            hasPasskey: false,

            setSession: (userId, role, groups, permissions, sites = [], passkeysEnabled = false, passkeyPolicy = 'disabled', hasPasskey = false) =>
                set({
                    isAuthenticated: true,
                    isLoading: false,
                    userId,
                    role,
                    groups,
                    permissions,
                    sites,
                    passkeysEnabled,
                    passkeyPolicy,
                    hasPasskey,
                }),

            clearSession: () =>
                set({
                    isAuthenticated: false,
                    isLoading: false,
                    userId: null,
                    role: null,
                    groups: [],
                    permissions: [],
                    sites: [],
                    passkeysEnabled: false,
                    passkeyPolicy: 'disabled',
                    hasPasskey: false,
                }),

            setLoading: (loading) =>
                set({ isLoading: loading }),
        }),
        {
            name: 'taskmaster-auth',
            partialize: (state) => ({
                isAuthenticated: state.isAuthenticated,
                userId: state.userId,
                role: state.role,
                groups: state.groups,
                permissions: state.permissions || [],
                sites: state.sites || [],
                passkeysEnabled: state.passkeysEnabled,
                passkeyPolicy: state.passkeyPolicy,
                hasPasskey: state.hasPasskey,
            }),
        }
    )
);

export const useIsSuperAdmin = () => useAuthStore((state) => state.role === 'SUPER_ADMIN');
export const useIsManager = () => useAuthStore((state) => state.role === 'MANAGER');
export const useIsAdminOrManager = () =>
    useAuthStore((state) => state.role === 'SUPER_ADMIN' || state.role === 'MANAGER');
// Backward compat
export const useIsAdmin = () =>
    useAuthStore((state) => state.role === 'SUPER_ADMIN' || state.role === 'ADMIN');
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useAuthLoading = () => useAuthStore((state) => state.isLoading);
export const useIsGuest = () => useAuthStore((state) => state.role === 'GUEST');
export const useIsReadOnly = () => useAuthStore((state) => state.role === 'GUEST');
export const useCanUpdateTask = () =>
    useAuthStore((state) =>
        state.role === 'SUPER_ADMIN' || state.role === 'MANAGER' || (state.permissions || []).includes('TASK_UPDATE'),
    );
