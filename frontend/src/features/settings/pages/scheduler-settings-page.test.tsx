import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchedulerJob } from '@/api/scheduler';
import i18n from '@/lib/i18n';
import { SchedulerSettingsPage } from './scheduler-settings-page';

const mocks = vi.hoisted(() => ({
    getJobs: vi.fn(), triggerJob: vi.fn(), toggleJob: vi.fn(), sync: vi.fn(),
    success: vi.fn(), error: vi.fn(), warning: vi.fn(),
    enabled: true,
}));

vi.mock('@/api/scheduler', () => ({ schedulerApi: mocks }));
vi.mock('sonner', () => ({ toast: mocks }));
vi.mock('../hooks/use-settings', () => ({
    useSettings: () => ({
        settings: [{ key: 'scheduler.enabled', value: mocks.enabled }],
        getSetting: () => mocks.enabled,
        isLoading: false,
    }),
}));

const job: SchedulerJob = {
    name: 'health-check', cron: '*/5 * * * *', enabled: true,
    description: 'System health monitoring', nextRun: null,
};
const lastRun = {
    status: 'success' as const,
    finishedAt: '2026-11-09T12:30:00.000Z', durationMs: 42,
    message: 'health-check job executed',
};
let client: QueryClient;
function show() {
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(<QueryClientProvider client={client}><SchedulerSettingsPage /></QueryClientProvider>);
}

beforeEach(async () => {
    vi.resetAllMocks();
    mocks.enabled = true;
    mocks.getJobs.mockResolvedValue([job]);
    await i18n.changeLanguage('en');
});
afterEach(async () => {
    cleanup();
    client?.clear();
    await i18n.changeLanguage('en');
});

describe('SchedulerSettingsPage last run', () => {
    it('shows an explicit empty state before the first run', async () => {
        show();
        expect(await screen.findByText('Last run')).toBeDefined();
        expect(screen.getByText('Not run yet')).toBeDefined();
    });

    it.each([
        ['success', 'Succeeded'], ['locked', 'Already running'], ['failed', 'Failed'], ['skipped', 'Skipped'],
    ] as const)('shows the %s result, time, duration and message', async (status, label) => {
        mocks.getJobs.mockResolvedValue([{ ...job, lastRun: { ...lastRun, status } }]);
        const { container } = show();
        expect(await screen.findByText(label)).toBeDefined();
        expect(screen.getByText('Duration: 42 ms')).toBeDefined();
        expect(screen.getByText(lastRun.message)).toBeDefined();
        const time = container.querySelector('time');
        expect(time?.dateTime).toBe(lastRun.finishedAt);
        expect(time?.textContent).toBe(new Date(lastRun.finishedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }));
    });

    it('translates last-run details into French', async () => {
        await i18n.changeLanguage('fr');
        mocks.getJobs.mockResolvedValue([{ ...job, lastRun: { ...lastRun, status: 'failed' } }]);
        show();
        expect(await screen.findByText('Dernier run')).toBeDefined();
        expect(screen.getByText('Échec')).toBeDefined();
        expect(screen.getByText('Durée : 42 ms')).toBeDefined();
    });

    it('refreshes last run after manual execution, including a manually paused job', async () => {
        mocks.getJobs.mockResolvedValueOnce([{ ...job, enabled: false }]);
        mocks.getJobs.mockResolvedValue([{ ...job, enabled: false, lastRun }]);
        mocks.triggerJob.mockResolvedValue({ ...lastRun, success: true });
        show();
        const button = await screen.findByRole('button', { name: 'Run' });
        expect(button).toHaveProperty('disabled', false);
        fireEvent.click(button);
        await waitFor(() => expect(mocks.triggerJob).toHaveBeenCalledWith('health-check'));
        expect(await screen.findByText('Succeeded')).toBeDefined();
        expect(mocks.success).toHaveBeenCalledWith(lastRun.message);
        expect(mocks.error).not.toHaveBeenCalled();
        expect(mocks.getJobs).toHaveBeenCalledTimes(2);
    });

    it.each(['locked', 'failed'])('does not present HTTP 200 with %s as success', async (status) => {
        const message = status === 'locked' ? 'Job is already running' : 'Redis unavailable';
        mocks.triggerJob.mockResolvedValue({ ...lastRun, status, success: false, message });
        show();
        fireEvent.click(await screen.findByRole('button', { name: 'Run' }));
        await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(message));
        expect(mocks.success).not.toHaveBeenCalled();
        await waitFor(() => expect(mocks.getJobs).toHaveBeenCalledTimes(2));
    });

    it('keeps the existing global pause restriction in the UI', async () => {
        mocks.enabled = false;
        show();
        expect(await screen.findByRole('button', { name: 'Run' })).toHaveProperty('disabled', true);
    });

    it('keeps job pause and resume available', async () => {
        mocks.toggleJob.mockResolvedValue({ success: true, enabled: false, message: 'Job stopped' });
        show();
        fireEvent.click(await screen.findByRole('button', { name: 'Pause the job' }));
        await waitFor(() => expect(mocks.toggleJob).toHaveBeenCalledWith('health-check'));
        expect(mocks.success).toHaveBeenCalledWith('Job stopped');
    });
});
