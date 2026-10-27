import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { TasksPage } from './tasks-page';
import { useTasks } from '@/hooks/use-tasks';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import i18n from '@/lib/i18n';
import { useAuthStore } from '@/stores/auth-store';
import { tasksApi } from '@/api/tasks';

type UseTasksResult = ReturnType<typeof useTasks>;

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
vi.mock('./components/bulk-deactivate-dialog', () => ({ BulkDeactivateDialog: ({ tasks }: { tasks: { name: string }[] }) => <div data-testid="bulk-deactivate">{tasks.map(task => task.name).join(',')}</div> }));
vi.mock('./components/bulk-delete-dialog', () => ({ BulkDeleteDialog: ({ tasks }: { tasks: { name: string }[] }) => <div data-testid="bulk-delete">{tasks.map(task => task.name).join(',')}</div> }));
vi.mock('./components/bulk-delegation-dialog', () => ({
    BulkDelegationDialog: ({ tasks }: { tasks: { name: string }[] }) => <div data-testid="bulk-dialog">{tasks.map(task => task.name).join(',')}</div>,
}));

// Mock Shadcn Tooltip to avoid Radix UI internal jsdom incompatibilities and render content immediately
vi.mock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Tooltip: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    TooltipTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    TooltipContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

describe('TasksPage - Delegations Tooltip', () => {
    beforeAll(async () => {
        await i18n.changeLanguage('fr');
    });

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
        } as unknown as UseTasksResult);

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
        } as unknown as UseTasksResult);

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
        } as unknown as UseTasksResult);

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
        } as unknown as UseTasksResult);

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
        } as unknown as UseTasksResult);

        renderWithRouter(<TasksPage />);

        screen.getByText('Délégué');

        expect(screen.getByText('Délégations actives')).toBeInTheDocument();

        const startStr = start.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' à ', ' ');
        const endStr = end.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' à ', ' ');

        const expectedText = `Délégué de Inconnu vers Aucun bénéficiaire du ${startStr} au ${endStr}`;
        expect(document.body.textContent).toContain(expectedText);
    });
    describe('bulk delegation', () => {
        const tasks = [1, 2, 3].map(id => ({ id, name: `Task ${id}`, isActive: id !== 2, delegations: [], assignedUserIds: [], assignedGroupIds: [] }));
        const show = (role: 'MANAGER' | 'USER') => {
            useAuthStore.setState({ role });
            vi.mocked(useTasks).mockReturnValue({ data: tasks, isLoading: false } as unknown as UseTasksResult);
            renderWithRouter(<TasksPage />);
        };

        it('lets a manager select tasks and delegate them together', () => {
            show('MANAGER');
            expect(screen.queryByRole('button', { name: 'Déléguer la sélection' })).toBeNull();
            fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Task 1' }));
            fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Task 3' }));
            expect(screen.getByText('2 tâches sélectionnées')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Déléguer la sélection' }));
            expect(screen.getByTestId('bulk-dialog')).toHaveTextContent('Task 1,Task 3');
        });

        it('selects every listed task from the header checkbox', () => {
            show('MANAGER');
            fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
            expect(screen.getByText('3 tâches sélectionnées')).toBeInTheDocument();
            fireEvent.click(screen.getByRole('button', { name: 'Annuler la sélection' }));
            expect(screen.queryByText('3 tâches sélectionnées')).toBeNull();
        });

        it('opens the deactivate and delete confirmations for the selection', () => {
            show('MANAGER');
            fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
            fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
            // Task 2 is already inactive: nothing to deactivate there.
            expect(screen.getByTestId('bulk-deactivate')).toHaveTextContent('Task 1,Task 3');
        });

        it('opens the delete confirmation with every selected task', () => {
            show('MANAGER');
            fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
            fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
            expect(screen.getByTestId('bulk-delete')).toHaveTextContent('Task 1,Task 2,Task 3');
        });

        it('reactivates only the inactive tasks of the selection, without confirmation', async () => {
            const reactivate = vi.spyOn(tasksApi, 'reactivate').mockResolvedValue({} as never);
            show('MANAGER');
            fireEvent.click(screen.getByRole('checkbox', { name: 'Tout sélectionner' }));
            fireEvent.click(screen.getByRole('button', { name: 'Réactiver' }));
            await waitFor(() => expect(reactivate).toHaveBeenCalledTimes(1));
            expect(reactivate).toHaveBeenCalledWith(2);
        });

        it('offers reactivation instead of deactivation when everything selected is inactive', () => {
            show('MANAGER');
            fireEvent.click(screen.getByRole('checkbox', { name: 'Sélectionner Task 2' }));
            expect(screen.getByRole('button', { name: 'Réactiver' })).toBeInTheDocument();
            expect(screen.queryByRole('button', { name: 'Désactiver' })).toBeNull();
        });

        it('offers no selection to a regular user', () => {
            show('USER');
            expect(screen.queryByRole('checkbox')).toBeNull();
        });
    });
});
