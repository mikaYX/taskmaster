import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { settingsApi } from '@/api/settings';
import type { SetSettingDto } from '@/api/types';
import { useIsAuthenticated } from '@/stores/auth-store';

import { toast } from 'sonner';

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
        mutationFn: settingsApi.set,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            toast.success(t('common.saveSuccess'));
        },
        onError: (error) => {
            console.error('Failed to update setting:', error);
            toast.error(t('common.saveError'));
        },
    });

    // Mutation to update multiple settings
    const updateBulkMutation = useMutation({
        mutationFn: settingsApi.setBulk,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            toast.success(t('common.saveSuccess'));
        },
        onError: (error) => {
            console.error('Failed to update settings:', error);
            toast.error(t('common.saveError'));
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
            toast.error(t('email.testError'));
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

    const updateSetting = (dto: SetSettingDto) => {
        updateMutation.mutate(dto);
    };

    const updateSettings = (settings: Record<string, unknown>) => {
        updateBulkMutation.mutate(settings);
    };

    const testEmail = (dto: { to: string[], subject?: string, body?: string }) => {
        testEmailMutation.mutate(dto);
    };

    const submitFeedbackMutation = useMutation({
        mutationFn: settingsApi.submitFeedback,
        onSuccess: () => {
            toast.success(t('settings.feedbackSuccess'));
        },
        onError: (error) => {
            console.error('Failed to submit feedback:', error);
            toast.error(t('settings.feedbackError'));
        },
    });

    const submitFeedback = (dto: { type: 'bug' | 'suggestion', title: string, description: string }) => {
        submitFeedbackMutation.mutate(dto);
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
        submitFeedback,
        isUpdating: updateMutation.isPending || updateBulkMutation.isPending,
        isTestingEmail: testEmailMutation.isPending,
        isSubmittingFeedback: submitFeedbackMutation.isPending,
        emailConfigStatus,
    };
}
