import { http } from './http';
import type { CorrectiveAction } from './types';

export const correctiveActionsApi = {
    search: (filters: { page: number; state: 'OPEN' | 'CLOSED'; search?: string; mine?: string; overdueBefore?: string }) =>
        http.get<{ items: CorrectiveAction[]; total: number; page: number; pageSize: number }>('/corrective-actions/search', { params: filters }),
    list: () => http.get<CorrectiveAction[]>('/corrective-actions'),
    update: (id: number, state: 'OPEN' | 'CLOSED', resolution?: string) => http.patch<CorrectiveAction>(`/corrective-actions/${id}`, { state, resolution }),
};
