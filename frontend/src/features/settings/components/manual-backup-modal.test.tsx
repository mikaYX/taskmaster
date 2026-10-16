import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ManualBackupModal } from './manual-backup-modal';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';

vi.mock('@/api/backup', () => ({ backupApi: { createSystem: vi.fn(), getJobStatus: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const clients: QueryClient[] = [];
function showModal() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const onSuccess = vi.fn();
    const onOpenChange = vi.fn();
    render(<QueryClientProvider client={client}><ManualBackupModal open canRunFull onSuccess={onSuccess} onOpenChange={onOpenChange} /></QueryClientProvider>);
    return { onSuccess, onOpenChange, client };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(backupApi.createSystem).mockResolvedValue({ jobId: '42', status: 'queued' });
});
afterEach(() => {
    cleanup();
    clients.splice(0).forEach(client => client.clear());
});

describe('manual backup completion', () => {
    it('keeps the dialog pending after queueing, and reports success only after completion', async () => {
        vi.mocked(backupApi.getJobStatus).mockResolvedValue({ jobId: '42', state: 'active' });
        const { onSuccess, onOpenChange, client } = showModal();
        fireEvent.click(screen.getByRole('button', { name: 'backupModal.runBackup' }));
        await screen.findByRole('status');
        expect(toast.success).not.toHaveBeenCalled();
        expect(onSuccess).not.toHaveBeenCalled();
        expect((screen.getByRole('button', { name: 'backupModal.runBackup' }) as HTMLButtonElement).disabled).toBe(true);
        vi.mocked(backupApi.getJobStatus).mockResolvedValue({ jobId: '42', state: 'completed', result: { filename: 'snapshot.enc' } });
        await client.invalidateQueries({ queryKey: ['backup-job', '42'] });
        await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
        expect(toast.success).toHaveBeenCalledWith('backupModal.completed');
        expect(onOpenChange).toHaveBeenCalledWith(false);
    });

    it('shows the worker failure and never announces a completed backup', async () => {
        vi.mocked(backupApi.getJobStatus).mockResolvedValue({ jobId: '42', state: 'failed', error: 'Check PG_BIN_PATH' });
        const { onSuccess } = showModal();
        fireEvent.click(screen.getByRole('button', { name: 'backupModal.runBackup' }));
        expect((await screen.findByRole('alert')).textContent).toContain('Check PG_BIN_PATH');
        expect(onSuccess).not.toHaveBeenCalled();
        expect(toast.success).not.toHaveBeenCalled();
    });
});
