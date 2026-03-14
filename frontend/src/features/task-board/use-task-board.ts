import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { tasksApi } from '@/api/tasks';
import type { BoardItem, TaskStatusValue } from '@/api/types';
import { ApiError } from '@/api/http';
import { isBefore, startOfDay, parseISO, isSameDay, isAfter, subHours } from 'date-fns';
import { toast } from 'sonner';
import { clampDateRange, loadTaskBoardPreferences, saveTaskBoardPreferences } from './lib/task-board-utils';

export function useTaskBoard(filters: { filterUserId?: number; filterGroupId?: number; searchQuery?: string; refetchInterval?: number } = {}) {
    const queryClient = useQueryClient();

    // Lazy init from localStorage
    const [prefs] = useState(() => loadTaskBoardPreferences());

    const [dateRange, setDateRangeInternal] = useState(prefs.dateRange);
    const [showCompleted, setShowCompletedInternal] = useState(prefs.showCompleted);

    // Track manual preference separately to handle "return from history" scenario
    const [manualShowCompleted, setManualShowCompleted] = useState(prefs.showCompleted);

    const setDateRange = useCallback((newRange: { start: Date; end: Date }) => {
        const clamped = clampDateRange(newRange);
        setDateRangeInternal(clamped);

        // Smart Toggle logic: If fully past, force showCompleted = true
        // If returning to current, restore manual preference
        const isPast = isBefore(clamped.end, startOfDay(new Date()));

        if (isPast) {
            setShowCompletedInternal(true);
            saveTaskBoardPreferences({ dateRange: clamped, showCompleted: true });
        } else {
            setShowCompletedInternal(manualShowCompleted);
            saveTaskBoardPreferences({ dateRange: clamped, showCompleted: manualShowCompleted });
        }
    }, [manualShowCompleted]);

    const setShowCompleted = useCallback((show: boolean) => {
        setShowCompletedInternal(show);
        setManualShowCompleted(show); // Update preference
        saveTaskBoardPreferences({ showCompleted: show });
    }, []);

    const { data: responseData, isLoading, error } = useQuery({
        queryKey: ['task-board', dateRange.start.toISOString(), dateRange.end.toISOString(), filters.filterUserId, filters.filterGroupId],
        queryFn: () => tasksApi.getBoard(dateRange.start.toISOString(), dateRange.end.toISOString(), filters.filterUserId, filters.filterGroupId),
        placeholderData: (previousData) => previousData,
        refetchInterval: filters.refetchInterval,
    });

    const statusMutation = useMutation({
        mutationFn: ({ taskId, date, status, comment }: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) =>
            tasksApi.setStatus(taskId, date, status, comment),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['task-board'] });
            toast.success('Statut mis à jour');
        },
        onError: (error: unknown) => {
            let message = 'Erreur lors de la mise à jour';
            if (error instanceof ApiError && error.data && typeof error.data === 'object') {
                const d = error.data as { message?: string; errors?: Record<string, string[]> };
                if (d.message) message = d.message;
                if (d.errors && Object.keys(d.errors).length > 0) {
                    const details = Object.entries(d.errors).flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((m) => `${k}: ${m}`));
                    message = details.join(' ');
                }
            }
            toast.error(message);
        }
    });

    const now = new Date();
    const today = startOfDay(now);

    const buckets = {
        pastDue: [] as BoardItem[],
        today: [] as BoardItem[],
        upcoming: [] as BoardItem[],
        completed: [] as BoardItem[],
    };

    const boardItems = responseData?.items;

    if (boardItems) {
        boardItems.forEach(item => {
            const periodStart = parseISO(item.periodStart);
            const periodEnd = parseISO(item.periodEnd);

            if (filters.searchQuery && !item.taskName?.toLowerCase().includes(filters.searchQuery.toLowerCase())) {
                return;
            }

            // SUCCESS / FAILED / MISSING → terminées
            if (item.status === 'SUCCESS' || item.status === 'FAILED' || item.status === 'MISSING') {
                buckets.completed.push(item);
                return;
            }

            // RUNNING dont la période est dépassée → today (grisé, en attente d'audit MISSING)
            if (isBefore(periodEnd, now) && item.status === 'RUNNING') {
                buckets.today.push(item);
                return;
            }

            // RUNNING dont la fin est dans moins d'1h → urgent
            const urgentThreshold = subHours(periodEnd, 1);
            if (item.status === 'RUNNING' && !isBefore(periodEnd, now) && isBefore(urgentThreshold, now)) {
                buckets.pastDue.push(item);
                return;
            }

            // Fenêtre couvre aujourd'hui → En cours
            if ((isBefore(periodStart, today) || isSameDay(periodStart, today)) &&
                (isAfter(periodEnd, today) || isSameDay(periodEnd, today))) {
                buckets.today.push(item);
                return;
            }

            // Futur → À venir
            if (isAfter(periodStart, today)) {
                buckets.upcoming.push(item);
                return;
            }

            // Fallback
            buckets.today.push(item);
        });
    }

    return {
        items: boardItems,
        buckets,
        isLoading,
        error,
        dateRange,
        setDateRange,
        showCompleted,
        setShowCompleted,
        updateStatus: statusMutation.mutate,
        isUpdating: statusMutation.isPending,
    };
}
