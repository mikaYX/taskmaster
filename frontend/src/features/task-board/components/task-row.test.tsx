import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '@/stores/auth-store';
import { TaskRow } from './task-row';
import type { BoardItem } from '@/api/types';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }),
}));

const finished: BoardItem = {
    taskId: 1,
    taskName: 'Panel check',
    instanceDate: '2026-10-16',
    originalDate: '2026-10-16',
    periodStart: '2026-10-16T08:00:00Z',
    periodEnd: '2026-10-16T18:00:00Z',
    status: 'SUCCESS',
    periodicity: 'daily',
    isShifted: false,
    assignedUsers: [],
    assignedGroups: [],
};

function show(role: 'SUPER_ADMIN' | 'MANAGER' | 'USER') {
    useAuthStore.setState({ role });
    const client = new QueryClient();
    render(
        <QueryClientProvider client={client}>
            <TaskRow item={finished} onStatusChange={vi.fn()} onAdminAction={vi.fn()} />
        </QueryClientProvider>,
    );
}

afterEach(cleanup);

describe('changing a finished status', () => {
    it('is offered to a super admin', () => {
        show('SUPER_ADMIN');
        expect(screen.getByRole('button', { name: 'common.edit' })).toBeDefined();
    });

    it.each(['MANAGER', 'USER'] as const)('is not offered to a %s, whom the API refuses', (role) => {
        show(role);
        expect(screen.queryByRole('button', { name: 'common.edit' })).toBeNull();
    });
});
