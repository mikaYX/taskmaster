import type { BoardItem, TaskStatusValue, UserRole } from '@/api/types';
import { isAfter, isValid, parseISO, startOfDay, endOfDay, differenceInDays, subDays, isSameDay } from 'date-fns';

export interface TaskInstance extends BoardItem {
    key: string;
}

export function canUserActOnTask(
    task: { assignedUsers: { id: number }[]; assignedGroups: { id: number }[] },
    userId: number,
    userGroups: number[],
    userRole: UserRole,
): boolean {
    if (userRole === 'ADMIN') return true;

    const assignedUsers = task.assignedUsers ?? [];
    const assignedGroups = task.assignedGroups ?? [];

    if (assignedUsers.length === 0 && assignedGroups.length === 0) return true;

    if (assignedUsers.some(u => u.id === userId)) return true;

    return assignedGroups.some(g => userGroups.includes(g.id));
}

export function getStatusBadgeVariant(status: TaskStatusValue):
    'default' | 'secondary' | 'destructive' | 'outline' {
    switch (status) {
        case 'SUCCESS': return 'default';
        case 'FAILED': return 'destructive';
        case 'MISSING': return 'secondary';
        case 'RUNNING': return 'outline';
        default: return 'outline';
    }
}

export function getStatusLabel(status: TaskStatusValue): string {
    switch (status) {
        case 'SUCCESS': return 'Validé';
        case 'FAILED': return 'Échoué';
        case 'MISSING': return 'Manquée';
        case 'RUNNING': return 'En cours';
        default: return status;
    }
}

export function formatDate(dateStr: string, locale = 'fr-FR'): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale, {
        weekday: 'short',
        day: 'numeric',
        month: 'short'
    });
}

// === Date & Persistence Utilities ===

export const MAX_RANGE_DAYS = 90;
const STORAGE_KEY = 'task-board-preferences';

export interface TaskBoardPreferences {
    dateRange: { start: Date; end: Date };
    showCompleted: boolean; // User preference (manual)
}

export const PRESETS = [
    { label: "Aujourd'hui", getValue: () => ({ start: startOfDay(new Date()), end: endOfDay(new Date()) }) },
    { label: '7j.', getValue: () => ({ start: startOfDay(subDays(new Date(), 6)), end: endOfDay(new Date()) }) }, // J (included) - 6 = 7 days total
    { label: '30j', getValue: () => ({ start: startOfDay(subDays(new Date(), 29)), end: endOfDay(new Date()) }) },
    { label: '90j', getValue: () => ({ start: startOfDay(subDays(new Date(), MAX_RANGE_DAYS - 1)), end: endOfDay(new Date()) }) },
];

export function getActivePresetLabel(range: { start: Date; end: Date }): string | undefined {
    return PRESETS.find(p => {
        const pVal = p.getValue();
        return isSameDay(range.start, pVal.start) && isSameDay(range.end, pVal.end);
    })?.label;
}

export function clampDateRange(range: { start?: Date; end?: Date }): { start: Date; end: Date } {
    const now = new Date();
    const todayEnd = endOfDay(now);

    // 1. Ensure defined
    let start = range.start || startOfDay(now);
    let end = range.end || todayEnd;

    // 2. Safety: Ensure Start/End types are dates and aligned
    if (!(start instanceof Date)) start = new Date(start);
    if (!(end instanceof Date)) end = new Date(end);

    start = startOfDay(start);
    end = endOfDay(end);

    // 3. No Future
    if (isAfter(end, todayEnd)) {
        end = todayEnd;
    }
    // 4. Start before End
    if (isAfter(start, end)) {
        start = startOfDay(end);
    }

    // 5. Max Duration (90 days) strict check
    // differenceInDays returns full days count.
    // e.g. Today - Today = 0. Range is 1 day.
    // So daysDiff = 0 means 1 day.
    // We want MAX_RANGE_DAYS.
    const daysDiff = differenceInDays(startOfDay(end), startOfDay(start)) + 1;

    if (daysDiff > MAX_RANGE_DAYS) {
        // Keep end, adjust start
        // start = end - (90 - 1) days
        start = startOfDay(subDays(end, MAX_RANGE_DAYS - 1));
    }

    return { start, end };
}

export function saveTaskBoardPreferences(prefs: Partial<Omit<TaskBoardPreferences, 'dateRange'> & { dateRange?: { start: Date; end: Date } }>) {
    try {
        const current = loadTaskBoardPreferences(); // Get current valid state as base
        const merged = { ...current, ...prefs };

        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            dateRange: {
                start: merged.dateRange.start.toISOString(),
                end: merged.dateRange.end.toISOString()
            },
            showCompleted: merged.showCompleted
        }));
    } catch (err) {
        console.warn('Failed to save task board preferences', err);
    }
}

export function loadTaskBoardPreferences(): TaskBoardPreferences {
    const defaultPrefs = {
        dateRange: {
            start: startOfDay(new Date()), // Aujourd'hui par défaut
            end: endOfDay(new Date())
        },
        showCompleted: false
    };

    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return defaultPrefs;

        const parsed = JSON.parse(raw);

        // Parse dates
        let start = parsed.dateRange?.start ? parseISO(parsed.dateRange.start) : defaultPrefs.dateRange.start;
        let end = parsed.dateRange?.end ? parseISO(parsed.dateRange.end) : defaultPrefs.dateRange.end;

        if (!isValid(start)) start = defaultPrefs.dateRange.start;
        if (!isValid(end)) end = defaultPrefs.dateRange.end;

        // Apply strict clamping on load
        const clamped = clampDateRange({ start, end });

        return {
            dateRange: clamped,
            showCompleted: typeof parsed.showCompleted === 'boolean' ? parsed.showCompleted : defaultPrefs.showCompleted
        };
    } catch {
        return defaultPrefs;
    }
}
