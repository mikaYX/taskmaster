import { http } from './http';
import type { Setting, SetSettingDto } from './types';

/**
 * Settings API module.
 */
export const settingsApi = {
    /**
     * Get public branding settings (no auth required).
     */
    getPublicBranding: () =>
        http.get<Record<string, unknown>>('/settings/public/branding'),

    /**
     * Get all settings.
     */
    getAll: () =>
        http.get<Setting[]>('/settings'),

    /**
     * Get setting by key.
     */
    getByKey: (key: string) =>
        http.get<Setting>(`/settings/${encodeURIComponent(key)}`),

    /**
     * Set setting value.
     */
    set: (dto: SetSettingDto) =>
        http.post<Setting>('/settings', dto),

    /**
     * Set multiple settings at once.
     */
    setBulk: (settings: Record<string, unknown>) =>
        http.post<Setting[]>('/settings/bulk', settings),

    /**
     * Delete setting (reset to default).
     */
    delete: (key: string) =>
        http.delete<void>(`/settings/${encodeURIComponent(key)}`),

    /**
     * Test email configuration.
     * Validates the provided configuration by sending a test email.
     * Does NOT save the configuration.
     */
    testEmail: (dto: { to: string[], subject?: string, body?: string }) =>
        http.post<void>('/settings/test-email', dto),

    /**
     * Test LDAP connection.
     */
    testLdapConnection: (dto: { url: string; bindDn?: string; bindPassword?: string; searchBase: string; searchFilter?: string }) =>
        http.post<{ success: boolean; message: string }>('/settings/test-ldap', dto),

    /**
     * Upload logo.
     */
    uploadLogo: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<{ url: string }>('/settings/upload-logo', formData);
    },

    /**
     * Upload favicon.
     */
    uploadFavicon: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<{ url: string }>('/settings/upload-favicon', formData);
    },

    /**
     * Preview cron schedule.
     */
    cronPreview: (expression: string) =>
        http.post<{ nextRuns: string[]; nextExecutions?: string[] }>('/settings/cron-preview', { expression }),

    /**
     * Get email configuration status.
     * Used by MFA Email OTP to determine availability.
     */
    getEmailConfigStatus: () =>
        http.get<{ enabled: boolean; configValid: boolean; provider: string }>('/settings/email/config-status'),

    /**
     * Get auth capabilities map to know which SSO providers are implemented.
     */
    getAuthCapabilities: () =>
        http.get<Record<string, { implemented: boolean; configured: boolean; enabled: boolean; effectiveEnabled: boolean }>>('/settings/auth/capabilities'),

    /**
     * Test Google OAuth connection.
     */
    testGoogleOAuth: (dto: { clientId: string; clientSecret: string; hostedDomain?: string }) =>
        http.post<{ success: boolean; message: string }>('/settings/google/test', dto),

    /**
     * Test Azure AD connection.
     */
    testAzureAd: (dto: { tenantId: string; clientId: string; clientSecret: string }) =>
        http.post<{ success: boolean; message: string }>('/settings/azure/test', dto),

    /**
     * Test SAML connection.
     */
    testSaml: (dto: { entityId: string; ssoUrl: string; x509: string; metadataUrl?: string }) =>
        http.post<{ success: boolean; message: string }>('/settings/saml/test', dto),

    /**
     * Test OIDC Generic configuration.
     */
    testOidcGeneric: (dto: { issuer: string; clientId: string; clientSecret: string; scopes?: string }) =>
        http.post<{ success: boolean; message: string }>('/settings/oidc/test', dto),

    /**
     * Submit feedback to GitHub.
     */
    submitFeedback: (dto: { type: 'bug' | 'suggestion'; title: string; description: string }) =>
        http.post<{ success: boolean }>('/settings/github/feedback', dto),
};
