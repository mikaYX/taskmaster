import { http } from './http';


export interface SystemJob {
    name: string;
    cron: string;
    enabled: boolean;
}

export const jobsApi = {
    /**
     * Get all system jobs status.
     */
    getAll: () => http.get<SystemJob[]>('/jobs'),

    /**
     * Trigger a system job manually.
     */
    run: (name: string) => http.post<{ success: boolean; message: string }>(`/jobs/${encodeURIComponent(name)}/run`),

    /**
     * Toggle a system job.
     */
    toggle: (name: string) => http.post<{ success: boolean; enabled: boolean; message: string }>(`/jobs/${encodeURIComponent(name)}/toggle`),
};

