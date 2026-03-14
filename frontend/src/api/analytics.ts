import { http } from './http';
import type {
    AnalyticsDateParams,
    AnalyticsOverview,
    AnalyticsTrendPoint,
    AnalyticsByTask,
    AnalyticsByUser,
} from './types';

export const analyticsApi = {
    getOverview: (params: AnalyticsDateParams) =>
        http.get<AnalyticsOverview>('/analytics/overview', { params: { ...params } }),

    getTrend: (params: AnalyticsDateParams & { groupBy?: 'day' | 'week' }) =>
        http.get<AnalyticsTrendPoint[]>('/analytics/trend', { params: { ...params } }),

    getByTask: (params: AnalyticsDateParams & { limit?: number }) =>
        http.get<AnalyticsByTask[]>('/analytics/by-task', { params: { ...params } }),

    getByUser: (params: AnalyticsDateParams) =>
        http.get<AnalyticsByUser[]>('/analytics/by-user', { params: { ...params } }),

    exportCsv: async (params: AnalyticsDateParams): Promise<void> => {
        const blob = await http.get<Blob>('/analytics/export/csv', { params: { ...params }, responseType: 'blob' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `analytics_${params.startDate}_${params.endDate}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
    },

    exportPdf: async (params: AnalyticsDateParams): Promise<void> => {
        const blob = await http.get<Blob>('/analytics/export/pdf', { params: { ...params }, responseType: 'blob' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `rapport_analytics_${params.startDate}_${params.endDate}.pdf`;
        a.click();
        window.URL.revokeObjectURL(url);
    },
};
