import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobs } from './use-jobs';

const { success, error, run } = vi.hoisted(() => ({
    success: vi.fn(),
    error: vi.fn(),
    run: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: { success, error } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('@/api/jobs', () => ({
    jobsApi: { getAll: vi.fn().mockResolvedValue([]), run, toggle: vi.fn() },
}));

const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

describe('useJobs runJob', () => {
    beforeEach(() => vi.clearAllMocks());

    it('shows a success toast when the job ran', async () => {
        run.mockResolvedValue({ success: true, message: 'email-reminders job executed' });
        const { result } = renderHook(() => useJobs(), { wrapper });

        result.current.runJob('email-reminders');

        await waitFor(() => expect(success).toHaveBeenCalledWith('email-reminders job executed'));
        expect(error).not.toHaveBeenCalled();
    });

    it('shows an error toast when the job was skipped or failed', async () => {
        run.mockResolvedValue({ success: false, message: 'Job is already running' });
        const { result } = renderHook(() => useJobs(), { wrapper });

        result.current.runJob('email-reminders');

        await waitFor(() => expect(error).toHaveBeenCalledWith('Job is already running'));
        expect(success).not.toHaveBeenCalled();
    });
});
