import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import { getErrorMessage } from '@/api/http';
import type { SetSettingDto } from '@/api/types';
import { useIsAuthenticated } from '@/stores/auth-store';

import { toast } from 'sonner';

/**
 * Settings pages save one key per call (12 on the e-mail page, 20+ on exports),
 * and every call used to raise its own toast. A fixed id makes sonner update a
 * single notification instead of stacking one per key.
 */
export const SETTINGS_SAVED_TOAST_ID = 'settings-saved';
export const SETTINGS_SAVE_ERROR_TOAST_ID = 'settings-save-error';

/**
 * Hook to manage settings with React Query.
 */
export function useSettings() {
    const queryClient = useQueryClient();
    const { t } = useTranslation();
    const isAuthenticated = useIsAuthenticated();

    // Query to fetch all settings
    const query = useQuery({
        queryKey: ['settings'],
        queryFn: () => settingsApi.getAll(),
        enabled: isAuthenticated,
        retry: false,
    });

    // Query to fetch email configuration status
    const emailConfigQuery = useQuery({
        queryKey: ['settings', 'email-config-status'],
        queryFn: () => settingsApi.getEmailConfigStatus(),
        enabled: isAuthenticated,
        retry: false,
    });

    // Destructure query results for easier access
    const { data: settings = [], isLoading, error } = query;
    const { data: emailConfigStatus } = emailConfigQuery;

    // Mutation to update a single setting
    const updateMutation = useMutation({
        mutationFn: ({ dto }: { dto: SetSettingDto; silent?: boolean }) => settingsApi.set(dto),
        onSuccess: (_data, { silent }) => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            queryClient.invalidateQueries({ queryKey: ['public-branding'] });
            // `silent` lets a page that shows its own confirmation avoid a second toast.
            if (!silent) toast.success(t('common.saveSuccess'), { id: SETTINGS_SAVED_TOAST_ID });
        },
        onError: (error) => {
            console.error('Failed to update setting:', error);
            toast.error(t('common.saveError'), { id: SETTINGS_SAVE_ERROR_TOAST_ID });
        },
    });

    // Mutation to update multiple settings
    const updateBulkMutation = useMutation({
        onMutate: () => {
            toast.dismiss(SETTINGS_SAVED_TOAST_ID);
            toast.dismiss(SETTINGS_SAVE_ERROR_TOAST_ID);
        },
        mutationFn: async (settings: Record<string, unknown>) => {
            const saved = await settingsApi.setBulk(settings);
            // The bulk endpoint can return a partial result when a key is rejected.
            const savedKeys = new Set(saved.map(setting => setting.key));
            const flattenKeys = (values: Record<string, unknown>, prefix = ''): string[] =>
                Object.entries(values).flatMap(([key, value]) => {
                    const fullKey = prefix ? `${prefix}.${key}` : key;
                    return value !== null && typeof value === 'object' && !Array.isArray(value)
                        ? flattenKeys(value as Record<string, unknown>, fullKey)
                        : [fullKey];
                });
            if (flattenKeys(settings).some(key => !savedKeys.has(key))) {
                throw new Error('Some settings were not saved');
            }
            return saved;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            queryClient.invalidateQueries({ queryKey: ['public-branding'] });
            toast.success(t('common.saveSuccess'), { id: SETTINGS_SAVED_TOAST_ID });
        },
        onError: (error) => {
            console.error('Failed to update settings:', error);
            toast.error(t('common.saveError'), { id: SETTINGS_SAVE_ERROR_TOAST_ID });
        },
    });

    const testEmailMutation = useMutation({
        mutationFn: (dto: { to: string[], subject?: string, body?: string }) =>
            settingsApi.testEmail(dto),
        onSuccess: () => {
            toast.success(t('email.testSuccess'));
        },
        onError: (error) => {
            console.error('Failed to send test email:', error);
            // The server says why (bad login, host unreachable, unreadable password...).
            toast.error(getErrorMessage(error, t('email.testError')), { duration: 10000 });
        },
    });

    // Helper to get a setting value by key
    const getSetting = useCallback(<T = string>(key: string): T | undefined => {
        const setting = settings.find((s) => s.key === key);
        return setting?.value as T | undefined;
    }, [settings]);

    // Helper to safely parse a setting as boolean
    const getSettingAsBool = useCallback((key: string): boolean => {
        const val = getSetting<unknown>(key);
        return val === true || val === 'true';
    }, [getSetting]);

    const updateSetting = (dto: SetSettingDto, options?: { silent?: boolean }) => {
        updateMutation.mutate({ dto, silent: options?.silent });
    };

    const updateSettings = (settings: Record<string, unknown>, options?: { onSuccess?: () => void }) => {
        updateBulkMutation.mutate(settings, options);
    };

    const testEmail = (dto: { to: string[], subject?: string, body?: string }) => {
        testEmailMutation.mutate(dto);
    };

    return {
        settings,
        isLoading,
        error,
        getSetting,
        getSettingAsBool,
        updateSetting,
        updateSettings,
        testEmail,
        isUpdating: updateMutation.isPending || updateBulkMutation.isPending,
        isTestingEmail: testEmailMutation.isPending,
        emailConfigStatus,
    };
}
