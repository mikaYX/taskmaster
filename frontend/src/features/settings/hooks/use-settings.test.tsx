import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
const api = vi.hoisted(() => ({
    getAll: vi.fn(),
    getEmailConfigStatus: vi.fn(),
    set: vi.fn(),
    setBulk: vi.fn(),
    testEmail: vi.fn(),
}));

vi.mock('sonner', () => ({ toast }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/stores/auth-store', () => ({ useIsAuthenticated: () => true }));
vi.mock('@/api/settings', () => ({ settingsApi: api }));

import {
    SETTINGS_SAVED_TOAST_ID,
    SETTINGS_SAVE_ERROR_TOAST_ID,
    useSettings,
} from './use-settings';

function wrapper({ children }: { children: ReactNode }) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSettings notifications', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.getAll.mockResolvedValue([]);
        api.getEmailConfigStatus.mockResolvedValue({ enabled: false, configValid: false, provider: 'smtp' });
        api.set.mockResolvedValue({});
        api.setBulk.mockResolvedValue({});
    });

    it('shares one toast id across the many single-key saves of a settings page', async () => {
        const { result } = renderHook(() => useSettings(), { wrapper });

        act(() => {
            for (const key of ['email.enabled', 'email.provider', 'email.from']) {
                result.current.updateSetting({ key, value: 'x' });
            }
        });

        await waitFor(() => expect(toast.success).toHaveBeenCalledTimes(3));
        for (const call of toast.success.mock.calls) {
            expect(call[1]).toEqual({ id: SETTINGS_SAVED_TOAST_ID });
        }
    });

    it('uses the same id for a bulk save', async () => {
        const { result } = renderHook(() => useSettings(), { wrapper });

        act(() => result.current.updateSettings({ a: 1 }));

        await waitFor(() => expect(toast.success).toHaveBeenCalledWith('common.saveSuccess', { id: SETTINGS_SAVED_TOAST_ID }));
    });

    it('also collapses repeated failures into one notification', async () => {
        api.set.mockRejectedValue(new Error('boom'));
        const { result } = renderHook(() => useSettings(), { wrapper });

        act(() => {
            result.current.updateSetting({ key: 'a', value: 1 });
            result.current.updateSetting({ key: 'b', value: 2 });
        });

        await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
        for (const call of toast.error.mock.calls) {
            expect(call[1]).toEqual({ id: SETTINGS_SAVE_ERROR_TOAST_ID });
        }
    });
});
