import { useQuery } from '@tanstack/react-query';
import { analyticsApi } from '../api/analytics';
import type { AnalyticsDateParams } from '../api/types';

export function useAnalyticsOverview(params: AnalyticsDateParams, refetchInterval?: number) {
    return useQuery({
        queryKey: ['analytics', 'overview', params],
        queryFn: () => analyticsApi.getOverview(params),
        enabled: Boolean(params.startDate && params.endDate),
        refetchInterval,
    });
}

export function useAnalyticsTrend(params: AnalyticsDateParams & { groupBy?: 'day' | 'week' }, refetchInterval?: number) {
    return useQuery({
        queryKey: ['analytics', 'trend', params],
        queryFn: () => analyticsApi.getTrend(params),
        enabled: Boolean(params.startDate && params.endDate),
        refetchInterval,
    });
}

export function useAnalyticsByTask(params: AnalyticsDateParams & { limit?: number }, refetchInterval?: number) {
    return useQuery({
        queryKey: ['analytics', 'by-task', params],
        queryFn: () => analyticsApi.getByTask(params),
        enabled: Boolean(params.startDate && params.endDate),
        refetchInterval,
    });
}

export function useAnalyticsByUser(params: AnalyticsDateParams, refetchInterval?: number) {
    return useQuery({
        queryKey: ['analytics', 'by-user', params],
        queryFn: () => analyticsApi.getByUser(params),
        enabled: Boolean(params.startDate && params.endDate),
        refetchInterval,
    });
}
