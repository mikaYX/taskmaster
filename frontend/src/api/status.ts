import { http } from './http';
import type {
    TaskStatus,
    SetStatusDto,
    StatusCounts,
} from './types';

/**
 * Status API module.
 */
export const statusApi = {
    /**
     * Set task status for a date.
     */
    set: (dto: SetStatusDto) =>
        http.post<TaskStatus>('/status', dto),

    /**
     * Get all statuses (with optional date range).
     */
    getAll: (params?: { startDate?: string; endDate?: string }) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.set('startDate', params.startDate);
        if (params?.endDate) searchParams.set('endDate', params.endDate);
        const query = searchParams.toString();
        return http.get<TaskStatus[]>(`/status${query ? `?${query}` : ''}`);
    },

    /**
     * Get status counts.
     */
    counts: (params?: { startDate?: string; endDate?: string }) => {
        const searchParams = new URLSearchParams();
        if (params?.startDate) searchParams.set('startDate', params.startDate);
        if (params?.endDate) searchParams.set('endDate', params.endDate);
        const query = searchParams.toString();
        return http.get<StatusCounts>(`/status/counts${query ? `?${query}` : ''}`);
    },

    /**
     * Get status history for a task.
     */
    getByTask: (taskId: number) =>
        http.get<TaskStatus[]>(`/status/task/${taskId}`),

    /**
     * Get specific status for task and date.
     */
    getByTaskAndDate: (taskId: number, date: string) =>
        http.get<TaskStatus>(`/status/task/${taskId}/date/${date}`),

    /**
     * Delete status for task and date.
     */
    deleteByTaskAndDate: (taskId: number, date: string) =>
        http.delete<void>(`/status/task/${taskId}/date/${date}`),
};
