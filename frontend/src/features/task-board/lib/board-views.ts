import { endOfDay, format, parseISO, startOfDay, subDays } from 'date-fns';
import { clampDateRange } from './task-board-utils';

export interface BoardFilters {
    searchQuery: string;
    filterUserId?: number;
    filterGroupId?: number;
    compact: boolean;
}
export type SavedRange = { days: 1 | 7 | 30 | 90 } | { start: string; end: string };
export interface SavedBoardView extends BoardFilters {
    id: string;
    name: string;
    range: SavedRange;
    showCompleted: boolean;
}
export interface BoardWorkspace { filters: BoardFilters; views: SavedBoardView[] }
export const defaultBoardFilters: BoardFilters = { searchQuery: '', compact: false };
const validId = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function boardWorkspaceKey(userId: number | null, siteId: number | null) {
    return `task-board-workspace-v1:${userId ?? 'anonymous'}:${siteId ?? 'all'}`;
}
export function sanitizeBoardFilters(value: unknown, teamFilters: boolean): BoardFilters {
    if (!isObject(value)) return { ...defaultBoardFilters };
    return {
        searchQuery: typeof value.searchQuery === 'string' ? value.searchQuery.slice(0, 255) : '',
        compact: value.compact === true,
        ...(teamFilters && validId(value.filterUserId) ? { filterUserId: value.filterUserId }
            : teamFilters && validId(value.filterGroupId) ? { filterGroupId: value.filterGroupId } : {}),
    };
}
function sanitizeRange(value: unknown): SavedRange | undefined {
    if (!isObject(value)) return;
    if ([1, 7, 30, 90].includes(Number(value.days)) && typeof value.days === 'number') return { days: value.days as 1 | 7 | 30 | 90 };
    if (typeof value.start === 'string' && typeof value.end === 'string' && [value.start, value.end].every(date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(parseISO(date).getTime()))) return { start: value.start, end: value.end };
}
export function readBoardWorkspace(key: string, teamFilters: boolean): BoardWorkspace {
    try {
        const data: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
        if (!isObject(data)) return { filters: { ...defaultBoardFilters }, views: [] };
        const ids = new Set<string>();
        const views: SavedBoardView[] = [];
        for (const view of Array.isArray(data.views) ? data.views.slice(0, 20) : []) {
            if (!isObject(view) || typeof view.id !== 'string' || !/^[a-f0-9]{32}$/.test(view.id) || ids.has(view.id) || typeof view.name !== 'string' || !view.name.trim()) continue;
            const range = sanitizeRange(view.range);
            if (!range) continue;
            ids.add(view.id);
            views.push({ id: view.id, name: view.name.trim().slice(0, 60), range, showCompleted: view.showCompleted === true, ...sanitizeBoardFilters(view, teamFilters) });
        }
        return { filters: sanitizeBoardFilters(data.filters, teamFilters), views };
    } catch { return { filters: { ...defaultBoardFilters }, views: [] }; }
}
export function writeBoardWorkspace(key: string, workspace: BoardWorkspace): boolean {
    try { localStorage.setItem(key, JSON.stringify(workspace)); return true; }
    catch { return false; }
}
export function snapshotViewRange(range: { start: Date; end: Date }, now = new Date()): SavedRange {
    for (const days of [1, 7, 30, 90] as const) {
        if (format(range.start, 'yyyy-MM-dd') === format(subDays(now, days - 1), 'yyyy-MM-dd') && format(range.end, 'yyyy-MM-dd') === format(now, 'yyyy-MM-dd')) return { days };
    }
    return { start: format(range.start, 'yyyy-MM-dd'), end: format(range.end, 'yyyy-MM-dd') };
}
export function resolveViewRange(range: SavedRange, now = new Date()) {
    return 'days' in range ? { start: startOfDay(subDays(now, range.days - 1)), end: endOfDay(now) }
        : clampDateRange({ start: parseISO(range.start), end: parseISO(range.end) });
}
export function newBoardViewId(): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
}
