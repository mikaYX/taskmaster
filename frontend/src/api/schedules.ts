import { http } from './http';

export interface Schedule {
    id: number;
    taskId: number;
    recurrenceMode: string;
    rrule: string | null;
    timezone: string;
    openOffset: number;
    closeOffset: number | null;
    dueOffset: number | null;
    status: string;
    maxOccurrences: number | null;
    occurrenceCount: number;
    endsAt: string | null;
    pausedAt: string | null;
    siteId: string | null;
    label: string | null;
    createdAt: string;
    updatedAt: string;
}

export const schedulesApi = {
    getAll: () => http.get<Schedule[]>('/schedules'),
    createBulk: (payload: { items: any[] }) => http.post<{ createdCount: number; ids: number[] }>('/schedules/bulk', payload),
};
