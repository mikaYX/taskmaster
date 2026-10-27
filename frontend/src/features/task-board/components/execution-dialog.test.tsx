import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { tasksApi } from '@/api/tasks';
import { useAuthStore } from '@/stores/auth-store';
import { ExecutionDialog } from './execution-dialog';
import type { BoardItem } from '@/api/types';

vi.mock('@/api/tasks', () => ({ tasksApi: { setStatus: vi.fn(), uploadEvidence: vi.fn(), executionAssignees: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const clients: QueryClient[] = [];
const item: BoardItem = { taskId: 1, taskName: 'Panel check', instanceDate: '2026-10-16', originalDate: '2026-10-16', periodStart: '2026-10-16T08:00:00Z', periodEnd: '2026-10-16T18:00:00Z', status: 'RUNNING', periodicity: 'daily', isShifted: false, assignedUsers: [], assignedGroups: [], executionChecklist: [
    { id: 'check', label: 'Panel inspected', kind: 'CHECK', required: true },
    { id: 'measure', label: 'Temperature', kind: 'NUMBER', required: true },
] };
function show(overrides: Partial<BoardItem> = {}, status: 'SUCCESS' | 'FAILED' = 'SUCCESS', readOnly = false) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
    const onClose = vi.fn();
    render(<QueryClientProvider client={client}><ExecutionDialog item={{ ...item, ...overrides }} status={status} readOnly={readOnly} onClose={onClose} /></QueryClientProvider>);
    return onClose;
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(tasksApi.setStatus).mockResolvedValue(undefined); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('execution submission', () => {
    it('requires mandatory steps and accepts a zero measurement', async () => {
        const onClose = show();
        const save = screen.getByRole('button', { name: 'taskBoard.validate' });
        expect((save as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(screen.getByRole('checkbox', { name: /Panel inspected/ }));
        fireEvent.change(screen.getByRole('spinbutton', { name: /Temperature/ }), { target: { value: '0' } });
        fireEvent.click(save);
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(tasksApi.setStatus).toHaveBeenCalledWith(1, '2026-10-16', 'SUCCESS', undefined, { executionAnswers: [{ id: 'check', value: true }, { id: 'measure', value: 0 }] });
    });
    it('retains entered answers when the server rejects the submission', async () => {
        vi.mocked(tasksApi.setStatus).mockRejectedValue(new Error('Window expired'));
        const onClose = show();
        fireEvent.click(screen.getByRole('checkbox', { name: /Panel inspected/ }));
        fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '12' } });
        fireEvent.click(screen.getByRole('button', { name: 'taskBoard.validate' }));
        await screen.findByRole('alert');
        expect(onClose).not.toHaveBeenCalled();
        expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('12');
    });
    it('sends an optional corrective action together with a failure', async () => {
        show({ executionChecklist: [] }, 'FAILED');
        fireEvent.click(screen.getByRole('checkbox', { name: 'execution.createCorrectiveAction' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'execution.actionTitle' }), { target: { value: 'Replace panel' } });
        fireEvent.click(screen.getByRole('button', { name: 'taskBoard.confirmFail' }));
        await waitFor(() => expect(tasksApi.setStatus).toHaveBeenCalled());
        expect(tasksApi.setStatus).toHaveBeenCalledWith(1, '2026-10-16', 'FAILED', undefined, { correctiveAction: { title: 'Replace panel', dueDate: undefined, assigneeId: undefined, assigneeGroupId: undefined } });
    });
    it('lets a manager hand the corrective action to a team', async () => {
        useAuthStore.setState({ role: 'MANAGER' });
        vi.mocked(tasksApi.executionAssignees).mockResolvedValue({ users: [{ id: 2, username: 'bob', fullname: null }], groups: [{ id: 7, name: 'Maintenance', memberCount: 3 }] });
        show({ executionChecklist: [] }, 'FAILED');
        fireEvent.click(screen.getByRole('checkbox', { name: 'execution.createCorrectiveAction' }));
        fireEvent.change(screen.getByRole('textbox', { name: 'execution.actionTitle' }), { target: { value: 'Replace panel' } });
        fireEvent.click(screen.getByRole('combobox', { name: 'execution.assignee' }));
        fireEvent.click(await screen.findByText('Maintenance'));
        fireEvent.click(screen.getByRole('button', { name: 'taskBoard.confirmFail' }));
        await waitFor(() => expect(tasksApi.setStatus).toHaveBeenCalled());
        expect(tasksApi.setStatus).toHaveBeenCalledWith(1, '2026-10-16', 'FAILED', undefined, { correctiveAction: { title: 'Replace panel', dueDate: undefined, assigneeId: undefined, assigneeGroupId: 7 } });
        useAuthStore.setState({ role: null });
    });
    it('shows the historical labels from the saved record', () => {
        show({ executionRecord: [{ id: 'check', label: 'Original panel label', kind: 'CHECK', required: true, value: true }] }, 'SUCCESS', true);
        expect(screen.getByText('Original panel label')).toBeDefined();
        expect(screen.queryByText('Panel inspected')).toBeNull();
        expect(screen.queryByRole('button', { name: 'taskBoard.validate' })).toBeNull();
    });
});
