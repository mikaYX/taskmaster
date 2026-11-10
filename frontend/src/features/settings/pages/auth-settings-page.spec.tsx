import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { AuthSettingsPage } from './auth-settings-page';
import { settingsApi } from '@/api/settings';
import React from 'react';

const mockSettings = vi.hoisted(() => {
    const values: Record<string, unknown> = {};
    return {
        values,
        settings: [] as { key: string; value: unknown }[],
        getSetting: vi.fn((key: string) => values[key]),
        getSettingAsBool: vi.fn((key: string) => values[key] === true || values[key] === 'true'),
    };
});

// Mock the modules
vi.mock('@/api/settings', () => ({
    settingsApi: {
        getAuthCapabilities: vi.fn(),
    }
}));

vi.mock('../hooks/use-settings', () => ({
    useSettings: () => ({
        settings: mockSettings.settings,
        getSetting: mockSettings.getSetting,
        getSettingAsBool: mockSettings.getSettingAsBool,
        updateSetting: vi.fn(),
        isLoading: false,
        isUpdating: false,
        emailConfigStatus: { enabled: true, configValid: true }
    })
}));

// Mock ResizeObserver for Radix UI
window.ResizeObserver = class ResizeObserver {
    observe() { }
    unobserve() { }
    disconnect() { }
};

// Mock ScrollArea component which might use missing window APIs in jsdom
vi.mock('@/components/ui/scroll-area', () => ({
    ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    ScrollBar: () => null,
}));

describe('AuthSettingsPage Capability Constraints', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSettings.settings.length = 0;
        for (const key of Object.keys(mockSettings.values)) delete mockSettings.values[key];
    });

    it('disables unimplemented providers and leaves implemented ones editable', async () => {
        vi.mocked(settingsApi.getAuthCapabilities).mockResolvedValue({
            azure_ad: { implemented: false, configured: false, enabled: false, effectiveEnabled: false },
            google_workspace: { implemented: false, configured: false, enabled: false, effectiveEnabled: false },
            saml: { implemented: false, configured: false, enabled: false, effectiveEnabled: false },
            oidc_generic: { implemented: true, configured: false, enabled: false, effectiveEnabled: false },
            ldap: { implemented: true, configured: false, enabled: false, effectiveEnabled: false },
        });

        render(<AuthSettingsPage />);
        const user = userEvent.setup();

        await waitFor(() => {
            expect(settingsApi.getAuthCapabilities).toHaveBeenCalled();
        });

        // 1. Azure AD (default tab)
        const azureSwitch = await screen.findByRole('switch');
        expect(azureSwitch).toBeDisabled();

        // 2. Google Workspace
        const googleTab = screen.getByRole('tab', { name: /Google Workspace/i });
        await user.click(googleTab);
        const googleSwitch = await screen.findByRole('switch');
        expect(googleSwitch).toBeDisabled();

        // 3. OIDC / SAML
        const oidcTab = screen.getByRole('tab', { name: /OIDC \/ SAML/i });
        await user.click(oidcTab);
        const oidcSwitch = await screen.findByRole('switch');
        expect(oidcSwitch).not.toBeDisabled();

        // 4. LDAP
        const ldapTab = screen.getByRole('tab', { name: /LDAP/i });
        await user.click(ldapTab);
        const ldapSwitch = await screen.findByRole('switch');
        expect(ldapSwitch).not.toBeDisabled();
    });

    it('activates read-only mode entirely when API fails', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { });
        vi.mocked(settingsApi.getAuthCapabilities).mockRejectedValue(new Error('API Down'));

        render(<AuthSettingsPage />);
        const user = userEvent.setup();

        await waitFor(() => {
            expect(settingsApi.getAuthCapabilities).toHaveBeenCalled();
        });

        // Error banner should be visible
        expect(await screen.findByText(/Connection Error/i)).toBeInTheDocument();

        // Save button should be disabled
        const saveBtn = screen.getByRole('button', { name: /^Save$/i });
        expect(saveBtn).toBeDisabled();

        // Azure should be disabled
        const azureSwitch = await screen.findByRole('switch');
        expect(azureSwitch).toBeDisabled();

        const ldapTab = screen.getByRole('tab', { name: /LDAP/i });
        await user.click(ldapTab);
        const ldapSwitch = await screen.findByRole('switch');
        expect(ldapSwitch).toBeDisabled();

        consoleSpy.mockRestore();
    });
    it.each([true, 'true', false, 'false'])('loads provider switches from stored value %s', async (value) => {
        for (const provider of ['azureAd', 'google', 'generic', 'ldap']) {
            const key = `auth.${provider}.enabled`;
            mockSettings.values[key] = value;
            mockSettings.settings.push({ key, value });
        }
        const capability = { implemented: true, configured: true, enabled: false, effectiveEnabled: false };
        vi.mocked(settingsApi.getAuthCapabilities).mockResolvedValue({
            azure_ad: capability,
            google_workspace: capability,
            oidc_generic: capability,
            ldap: capability,
            saml: capability,
        });
        render(<AuthSettingsPage />);
        const user = userEvent.setup();
        const expected = value === true || value === 'true';
        for (const tab of [/Azure AD/i, /Google Workspace/i, /OIDC \/ SAML/i, /LDAP/i]) {
            await user.click(await screen.findByRole('tab', { name: tab }));
            await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', String(expected)));
        }
        for (const provider of ['azureAd', 'google', 'generic', 'ldap']) {
            expect(mockSettings.getSettingAsBool).toHaveBeenCalledWith(`auth.${provider}.enabled`);
        }
    });

});
