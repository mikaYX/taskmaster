import { http } from './http';

export interface JobExecutionResult {
    success: boolean;
    status: 'success' | 'locked' | 'failed' | 'skipped';
    message: string;
    error?: string;
    finishedAt: string;
    durationMs: number;
}

export interface SchedulerJob {
    name: string;
    cron: string;
    enabled: boolean;
    nextRun: string | null;
    description: string;
    lastRun?: Pick<JobExecutionResult, 'status' | 'finishedAt' | 'durationMs'> & {
        message?: string;
    };
}

export const schedulerApi = {
    /**
     * Get status of all system jobs.
     */
    getJobs: () =>
        http.get<SchedulerJob[]>('/jobs'),

    /**
     * Toggle a job (Admin only, though UI might be read-only for individual jobs).
     */
    toggleJob: (name: string) =>
        http.post<{ success: boolean; enabled: boolean; message: string }>(`/jobs/${encodeURIComponent(name)}/toggle`),

    /**
     * Trigger a job manually.
     */
    triggerJob: (name: string) =>
        http.post<JobExecutionResult>(`/jobs/${encodeURIComponent(name)}/run`),

    /**
     * Sync Master Scheduler state (read settings and apply).
     */
    sync: () =>
        http.post<{ enabled: boolean; message: string }>('/jobs/sync'),
};
