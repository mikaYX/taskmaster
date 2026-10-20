import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';

const auth = vi.hoisted(() => ({ role: 'USER' as string | null }));

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
}));
vi.mock('@/stores', () => ({
    useAuthStore: (selector: (state: { role: string | null }) => unknown) => selector({ role: auth.role }),
}));
vi.mock('@/hooks/use-auth', () => ({ useLogout: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/use-users', () => ({
    useOwnProfile: () => ({ data: { fullname: 'Alice Martin', username: 'alice', avatarUrl: null } }),
}));
vi.mock('@/features/todos/todo-attention-badge', () => ({ TodoAttentionBadge: () => null }));
vi.mock('@/hooks/use-public-branding', () => ({
    usePublicBranding: () => ({
        getSetting: () => undefined,
        getSettingAsBool: (key: string) => key === 'addons.todolist.enabled',
    }),
}));

function menuTargets(role: string) {
    auth.role = role;
    const { container } = render(
        <MemoryRouter>
            <SidebarProvider>
                <AppSidebar />
            </SidebarProvider>
        </MemoryRouter>,
    );
    return Array.from(container.querySelectorAll('a')).map((link) => link.getAttribute('href'));
}

describe('sidebar entries by role', () => {
    beforeAll(() => {
        // jsdom has no matchMedia, which the sidebar uses to detect a phone-sized screen.
        window.matchMedia = ((query: string) => ({
            matches: false,
            media: query,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => false,
            onchange: null,
        })) as unknown as typeof window.matchMedia;
    });

    beforeEach(() => {
        auth.role = 'USER';
    });

    it('never has a Users entry: users are managed in Settings > Security', () => {
        for (const role of ['SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST']) {
            expect(menuTargets(role)).not.toContain('/users');
        }
    });

    it('gives a super administrator the whole administration', () => {
        expect(menuTargets('SUPER_ADMIN')).toEqual(
            expect.arrayContaining(['/task-definitions', '/settings', '/admin/audit']),
        );
    });

    it('gives a manager Settings (which only shows the users part), but not the audit log', () => {
        const targets = menuTargets('MANAGER');

        expect(targets).toContain('/settings');
        expect(targets).toContain('/task-definitions');
        expect(targets).not.toContain('/admin/audit');
    });

    it.each(['USER', 'GUEST'])('gives a %s neither Settings nor the audit log', (role) => {
        const targets = menuTargets(role);

        expect(targets).not.toContain('/settings');
        expect(targets).not.toContain('/admin/audit');
    });
});
