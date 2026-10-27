import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BulkDelegationDialog } from './bulk-delegation-dialog';
import { useCreateBulkDelegation } from '@/hooks/use-tasks';
import type { Task } from '@/api/types';

vi.mock('@/hooks/use-tasks', () => ({ useCreateBulkDelegation: vi.fn() }));
vi.mock('@/hooks/use-users', () => ({ useUsers: () => ({ data: [{ id: 2, username: 'bob', fullname: 'Bob', deletedAt: null }] }) }));
vi.mock('@/hooks/use-groups', () => ({ useGroups: () => ({ data: [{ id: 7, name: 'Maintenance', memberCount: 3 }] }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => (values?.count !== undefined ? `${key}:${values.count}` : key) }) }));
vi.mock('@/components/ui/date-time-input', () => ({
    DateTimeInput: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => <input id={id} value={value} onChange={event => onChange(event.target.value)} />,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tasks = [{ id: 1, name: 'Fridge' }, { id: 2, name: 'Oven' }] as Task[];
const mutate = vi.fn();

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCreateBulkDelegation).mockReturnValue({ mutate, isPending: false } as unknown as ReturnType<typeof useCreateBulkDelegation>);
});
afterEach(cleanup);

function fill() {
    fireEvent.change(screen.getByLabelText('taskDelegations.startTime'), { target: { value: '2026-11-02T08:00' } });
    fireEvent.change(screen.getByLabelText('taskDelegations.endTime'), { target: { value: '2026-11-09T18:00' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'taskDelegations.delegateTo' }));
}

describe('BulkDelegationDialog', () => {
    it('stays disabled until dates and a target are chosen, then sends one request for all tasks', async () => {
        const onClose = vi.fn();
        render(<BulkDelegationDialog tasks={tasks} open onClose={onClose} />);
        const submit = screen.getByRole('button', { name: 'taskDelegations.bulk.submit' });
        expect(submit).toBeDisabled();
        fill();
        fireEvent.click(await screen.findByText('Maintenance'));
        expect(submit).toBeEnabled();
        fireEvent.click(submit);
        expect(mutate).toHaveBeenCalledWith(
            expect.objectContaining({ taskIds: [1, 2], targetGroupIds: [7], targetUserIds: [], reason: undefined }),
            expect.anything(),
        );
        mutate.mock.calls[0][1].onSuccess({ created: [{ taskId: 1, delegationId: 1 }, { taskId: 2, delegationId: 2 }], failed: [] });
        await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
    });

    it('lists the tasks that could not be delegated instead of closing', async () => {
        const onClose = vi.fn();
        render(<BulkDelegationDialog tasks={tasks} open onClose={onClose} />);
        fill();
        fireEvent.click(await screen.findByText('Bob'));
        fireEvent.click(screen.getByRole('button', { name: 'taskDelegations.bulk.submit' }));
        act(() => mutate.mock.calls[0][1].onSuccess({ created: [{ taskId: 1, delegationId: 1 }], failed: [{ taskId: 2, taskName: 'Oven', reason: 'Overlapping delegation' }] }));
        expect(await screen.findByText(/Overlapping delegation/)).toBeInTheDocument();
        expect(screen.getByText('Oven')).toBeInTheDocument();
        expect(onClose).not.toHaveBeenCalled();
    });
});
