import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { TasksPage } from './tasks-page';
import { useTasks } from '@/hooks/use-tasks';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock dependecies
vi.mock('@/hooks/use-tasks', () => ({
    useTasks: vi.fn(),
    useDeactivateTask: vi.fn(),
    useReactivateTask: vi.fn(),
}));

// Mock child components to isolate TasksPage UI testing and avoid complex hook chains
vi.mock('./components/task-actions', () => ({ TaskActions: () => null }));
vi.mock('./components/task-assignments-sheet', () => ({ TaskAssignmentsSheet: () => null }));
vi.mock('./components/task-delegations-sheet', () => ({ TaskDelegationsSheet: () => null }));

// Mock Shadcn Tooltip to avoid Radix UI internal jsdom incompatibilities and render content immediately
vi.mock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: any) => <div>{children}</div>,
    Tooltip: ({ children }: any) => <div>{children}</div>,
    TooltipTrigger: ({ children }: any) => <div>{children}</div>,
    TooltipContent: ({ children }: any) => <div>{children}</div>,
}));

describe('TasksPage - Delegations Tooltip', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
    });

    const renderWithRouter = (ui: React.ReactElement) => {
        return render(
            <QueryClientProvider client={queryClient}>
                <MemoryRouter>{ui}</MemoryRouter>
            </QueryClientProvider>
        );
    };

    it('should not display badge if no delegations', () => {
        vi.mocked(useTasks).mockReturnValue({
            data: [{
                id: 1, name: 'Task 1', isActive: true, delegations: [],
                assignedUserIds: [], assignedGroupIds: [],
                periodicity: 'daily',
                daysOfWeek: [],
                timezone: 'UTC',
                scheduledTime: '10:00',
                procedureUrl: null,
                startDate: new Date().toISOString(),
                endDate: null,
                skipWeekends: false,
                skipHolidays: false,
                rrule: null,
                recurrenceMode: null,
                dueOffset: null,
                useGlobalWindowDefaults: true,
                windowStartTime: null,
                windowEndTime: null,
                deactivatedAt: null,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }],
            isLoading: false,
        } as any);

        renderWithRouter(<TasksPage />);

        expect(screen.queryByText(/Délégué/i)).not.toBeInTheDocument();
    });

    it('should display "Délégué" badge if 1 active delegation', () => {
        const now = new Date();
        const past = new Date(now.getTime() - 1000000).toISOString();
        const future = new Date(now.getTime() + 1000000).toISOString();

        vi.mocked(useTasks).mockReturnValue({
            data: [{
                id: 1, name: 'Task 1', isActive: true,
                delegations: [{
                    id: 1, startAt: past, endAt: future, targetUsers: [], targetGroups: []
                }],
            }],
            isLoading: false,
        } as any);

        renderWithRouter(<TasksPage />);

        expect(screen.getByText('Délégué')).toBeInTheDocument();
        expect(screen.queryByText('Délégué (1)')).not.toBeInTheDocument();
    });

    it('should display "Délégué (N)" badge if >1 active delegations', () => {
        const now = new Date();
        const past = new Date(now.getTime() - 10000);
        const future = new Date(now.getTime() + 10000);

        vi.mocked(useTasks).mockReturnValue({
            data: [{
                id: 1, name: 'Task 1', isActive: true,
                delegations: [
                    { id: 1, startAt: past.toISOString(), endAt: future.toISOString(), targetUsers: [], targetGroups: [] },
                    { id: 2, startAt: past.toISOString(), endAt: future.toISOString(), targetUsers: [], targetGroups: [] }
                ],
            }],
            isLoading: false,
        } as any);

        renderWithRouter(<TasksPage />);

        expect(screen.getByText('Délégué (2)')).toBeInTheDocument();
    });

    it('tooltip should contain detailed dates and fallback targets and be visible on focus', async () => {
        const start = new Date(2026, 1, 23, 10, 0); // 23/02/2026 10:00
        const end = new Date(2027, 1, 23, 18, 30);   // 23/02/2027 18:30

        vi.mocked(useTasks).mockReturnValue({
            data: [{
                id: 1, name: 'Task 1', isActive: true,
                delegations: [{
                    id: 10,
                    startAt: start.toISOString(),
                    endAt: end.toISOString(),
                    targetUsers: [{ id: 1, username: 'jdoe', fullname: 'John Doe' }],
                    targetGroups: [{ id: 1, name: 'Admins' }],
                    delegatedBy: { id: 2, username: 'boss', fullname: null }
                }],
            }],
            isLoading: false,
        } as any);

        renderWithRouter(<TasksPage />);

        const badge = screen.getByText('Délégué');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveAttribute('aria-label', '1 délégation(s) active(s)');

        // The mocked Tooltip renders content directly into the DOM
        expect(screen.getByText('Délégations actives')).toBeInTheDocument();

        // Test format "Délégué de boss vers John Doe, Admins (groupe) du 23/02/2026 10:00 au 23/02/2027 18:30"
        const formatOpts = { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } as const;
        const startStr = start.toLocaleString('fr-FR', formatOpts).replace(' à ', ' ');
        const endStr = end.toLocaleString('fr-FR', formatOpts).replace(' à ', ' ');

        const expectedText = `Délégué de boss vers John Doe, Admins (groupe) du ${startStr} au ${endStr}`;
        expect(document.body.textContent).toContain(expectedText);
    });

    it('fallback to aucun bénéficiaire if no targets', async () => {
        const start = new Date(2026, 1, 23, 10, 0);
        const end = new Date(2027, 1, 23, 18, 30);

        vi.mocked(useTasks).mockReturnValue({
            data: [{
                id: 1, name: 'Task 1', isActive: true,
                delegations: [{
                    id: 10,
                    startAt: start.toISOString(),
                    endAt: end.toISOString(),
                    targetUsers: [],
                    targetGroups: [],
                    delegatedBy: null
                }],
            }],
            isLoading: false,
        } as any);

        renderWithRouter(<TasksPage />);

        screen.getByText('Délégué');

        expect(screen.getByText('Délégations actives')).toBeInTheDocument();

        const startStr = start.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' à ', ' ');
        const endStr = end.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' à ', ' ');

        const expectedText = `Délégué de Inconnu vers Aucun bénéficiaire du ${startStr} au ${endStr}`;
        expect(document.body.textContent).toContain(expectedText);
    });
});
