import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './settings-page';

const auth = vi.hoisted(() => ({ role: 'SUPER_ADMIN' as string }));
const security = vi.hoisted(() => ({ mounted: false }));
const addons = vi.hoisted(() => ({ todolist: false }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('@/stores/auth-store', () => ({
    useAuthStore: (selector: (state: { role: string }) => unknown) => selector({ role: auth.role }),
}));

// The tabs' content is out of scope: only which tabs a role can reach matters here.
vi.mock('./pages/security-settings-page', () => ({
    SecuritySettingsPage: () => {
        security.mounted = true;
        return <div data-testid="security-content" />;
    },
}));
vi.mock('./pages/general-settings-page', () => ({ GeneralSettingsPage: () => null }));
vi.mock('./pages/auth-settings-page', () => ({ AuthSettingsPage: () => null }));
vi.mock('./pages/email-settings-page', () => ({ EmailSettingsPage: () => null }));
vi.mock('./pages/export-settings-page', () => ({ ExportSettingsPage: () => null }));
vi.mock('./pages/backup-settings-page', () => ({ BackupSettingsPage: () => null }));
vi.mock('./pages/scheduler-settings-page', () => ({ SchedulerSettingsPage: () => null }));
vi.mock('./pages/api-keys-settings-page', () => ({ ApiKeysSettingsPage: () => null }));
vi.mock('./pages/sites-settings-page', () => ({ SitesSettingsPage: () => null }));
vi.mock('./pages/notifications-settings-page', () => ({ NotificationsSettingsPage: () => null }));
vi.mock('./pages/updates-page', () => ({ UpdatesPage: () => null }));
vi.mock('./pages/todo-notifications-settings-page', () => ({ TodoNotificationsSettingsPage: () => null }));
vi.mock('@/hooks/use-public-branding', () => ({
    usePublicBranding: () => ({ getSettingAsBool: (key: string) => key === 'addons.todolist.enabled' && addons.todolist }),
}));

const renderPage = (role: string) => {
    auth.role = role;
    render(
        <MemoryRouter>
            <SettingsPage />
        </MemoryRouter>,
    );
    return screen.getAllByRole('tab').map((tab) => tab.textContent);
};

describe('SettingsPage tabs by role', () => {
    beforeEach(() => {
        security.mounted = false;
        addons.todolist = false;
    });

    it('shows a manager the Security tab only (users and groups), none of the application settings', () => {
        expect(renderPage('MANAGER')).toEqual(['settings.security']);

        expect(screen.getByTestId('security-content')).toBeDefined();
    });

    it('shows a super administrator every tab, with the full Security page', () => {
        expect(renderPage('SUPER_ADMIN')).toEqual(
            expect.arrayContaining([
                'settings.general',
                'settings.security',
                'settings.auth',
                'settings.email',
                'settings.export',
                'settings.backup',
                'settings.scheduler',
                'settings.sites',
                'settings.updates',
            ]),
        );
        // The default tab of a super administrator is General, so Security is not mounted yet.
        expect(security.mounted).toBe(false);
    });

    it('shows the todo notifications tab to a super administrator only while the todolist is on', () => {
        expect(renderPage('SUPER_ADMIN')).not.toContain('settings.todoNotifications.tab');
    });

    it('lists the todo notifications tab once the todolist is on', () => {
        addons.todolist = true;
        expect(renderPage('SUPER_ADMIN')).toContain('settings.todoNotifications.tab');
    });

    it('never shows the todo notifications tab to a manager', () => {
        addons.todolist = true;
        expect(renderPage('MANAGER')).toEqual(['settings.security']);
    });
});
