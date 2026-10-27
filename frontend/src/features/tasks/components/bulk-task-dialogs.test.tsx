import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { BulkDeactivateDialog } from './bulk-deactivate-dialog';
import { BulkDeleteDialog } from './bulk-delete-dialog';
import { tasksApi } from '@/api/tasks';
import { toast } from 'sonner';

vi.mock('@/api/tasks', () => ({ tasksApi: { deactivate: vi.fn(), deleteTask: vi.fn() } }));
vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key: string, values?: Record<string, unknown>) => (values?.count !== undefined ? `${key}:${values.count}` : key) }),
    Trans: ({ i18nKey }: { i18nKey: string }) => <span>{i18nKey}</span>,
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const tasks = [{ id: 1, name: 'Fridge' }, { id: 2, name: 'Oven' }, { id: 3, name: 'Panel' }];

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(tasksApi.deactivate).mockResolvedValue({} as never);
    vi.mocked(tasksApi.deleteTask).mockResolvedValue({ message: 'ok' });
});
afterEach(cleanup);

describe('BulkDeactivateDialog', () => {
    it('deactivates every task after confirmation', async () => {
        const onClose = vi.fn();
        render(<BulkDeactivateDialog tasks={tasks} open onClose={onClose} />);
        expect(tasksApi.deactivate).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'taskList.actions.deactivate' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
        expect(vi.mocked(tasksApi.deactivate).mock.calls.map(call => call[0])).toEqual([1, 2, 3]);
        expect(toast.success).toHaveBeenCalledWith('taskList.bulk.deactivated:3');
    });

    it('reports the tasks that failed and still refreshes for the others', async () => {
        vi.mocked(tasksApi.deactivate).mockImplementation(id => (id === 2 ? Promise.reject(new Error('forbidden')) : Promise.resolve({} as never)));
        const onClose = vi.fn();
        render(<BulkDeactivateDialog tasks={tasks} open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'taskList.actions.deactivate' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
        expect(toast.error).toHaveBeenCalledWith('taskList.bulk.deactivateFailed:1', { description: 'Oven' });
    });

    it('does nothing when cancelled', () => {
        const onClose = vi.fn();
        render(<BulkDeactivateDialog tasks={tasks} open onClose={onClose} />);
        fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
        expect(onClose).toHaveBeenCalledWith(false);
        expect(tasksApi.deactivate).not.toHaveBeenCalled();
    });
});

describe('BulkDeleteDialog', () => {
    it('requires typing the number of tasks before deleting', async () => {
        const onClose = vi.fn();
        render(<BulkDeleteDialog tasks={tasks} open onClose={onClose} />);
        const submit = screen.getByRole('button', { name: 'taskList.bulk.deleteTitle:3' });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '2' } });
        expect(submit).toBeDisabled();
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '3' } });
        fireEvent.click(submit);
        await waitFor(() => expect(onClose).toHaveBeenCalledWith(true));
        expect(vi.mocked(tasksApi.deleteTask).mock.calls.map(call => call[0])).toEqual([1, 2, 3]);
        expect(toast.success).toHaveBeenCalledWith('taskList.bulk.deleted:3', expect.anything());
    });

    it('keeps the selection when every deletion fails', async () => {
        vi.mocked(tasksApi.deleteTask).mockRejectedValue(new Error('no'));
        const onClose = vi.fn();
        render(<BulkDeleteDialog tasks={tasks} open onClose={onClose} />);
        fireEvent.change(screen.getByRole('textbox'), { target: { value: '3' } });
        fireEvent.click(screen.getByRole('button', { name: 'taskList.bulk.deleteTitle:3' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledWith(false));
        expect(toast.error).toHaveBeenCalledWith('taskList.bulk.deleteFailed:3', { description: 'Fridge, Oven, Panel' });
    });
});
