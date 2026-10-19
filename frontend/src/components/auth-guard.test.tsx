import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores';
import { AnalyticsGuard, BoardGate } from './auth-guard';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key }),
    initReactI18next: { type: '3rdParty', init: () => undefined },
}));

function open(path: string) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <Routes>
                <Route path="/" element={<BoardGate><div>BOARD</div></BoardGate>} />
                <Route path="/analytics" element={<AnalyticsGuard><div>ANALYTICS</div></AnalyticsGuard>} />
            </Routes>
        </MemoryRouter>,
    );
}

const signedInAs = (role: 'GUEST' | 'SUPER_ADMIN' | 'MANAGER' | 'USER', guestView: 'DASHBOARD' | 'ANALYTICS' | null = null) =>
    useAuthStore.setState({ isAuthenticated: true, isLoading: false, role, guestView });

describe('TV screens only open their own page', () => {
    beforeEach(() => {
        useAuthStore.getState().clearSession();
    });

    it('sends an analytics screen to the analytics when it lands on the board', () => {
        signedInAs('GUEST', 'ANALYTICS');
        open('/');

        expect(screen.getByText('ANALYTICS')).toBeDefined();
        expect(screen.queryByText('BOARD')).toBeNull();
    });

    it('lets an analytics screen stay on the analytics', () => {
        signedInAs('GUEST', 'ANALYTICS');
        open('/analytics');

        expect(screen.getByText('ANALYTICS')).toBeDefined();
    });

    it('keeps a dashboard screen on the board, and out of the analytics', () => {
        signedInAs('GUEST', 'DASHBOARD');
        open('/');
        expect(screen.getByText('BOARD')).toBeDefined();
    });

    it('sends a dashboard screen back to the board when it asks for the analytics', () => {
        signedInAs('GUEST', 'DASHBOARD');
        open('/analytics');

        expect(screen.getByText('BOARD')).toBeDefined();
        expect(screen.queryByText('ANALYTICS')).toBeNull();
    });

    it('treats a screen without a view (old account) as the board', () => {
        signedInAs('GUEST', null);
        open('/analytics');

        expect(screen.getByText('BOARD')).toBeDefined();
    });

    it.each(['SUPER_ADMIN', 'MANAGER', 'USER'] as const)('does not redirect a %s anywhere', (role) => {
        signedInAs(role);
        open('/');
        expect(screen.getByText('BOARD')).toBeDefined();
    });

    it.each(['SUPER_ADMIN', 'MANAGER', 'USER'] as const)('lets a %s open the analytics', (role) => {
        signedInAs(role);
        open('/analytics');
        expect(screen.getByText('ANALYTICS')).toBeDefined();
    });
});
