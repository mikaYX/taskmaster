import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardWorkspaceKey, readBoardWorkspace, writeBoardWorkspace, snapshotViewRange, resolveViewRange, type SavedBoardView } from './board-views';
import { format } from 'date-fns';
const data = new Map<string, string>();
const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => { data.set(key, value); }) };
const view: SavedBoardView = { id: 'a'.repeat(32), name: 'Ronde', range: { days: 7 }, searchQuery: 'Panel', compact: true, filterUserId: 4, showCompleted: true };
beforeEach(() => { data.clear(); vi.stubGlobal('localStorage', storage); storage.getItem.mockClear(); storage.setItem.mockClear(); });
afterEach(() => vi.unstubAllGlobals());

describe('saved board views', () => {
    it('isolates saved filters by account and site', () => {
        writeBoardWorkspace(boardWorkspaceKey(1, 1), { filters: view, views: [view] });
        expect(readBoardWorkspace(boardWorkspaceKey(1, 1), true).views).toEqual([view]);
        expect(readBoardWorkspace(boardWorkspaceKey(2, 1), true).views).toEqual([]);
        expect(readBoardWorkspace(boardWorkspaceKey(1, 2), true).views).toEqual([]);
    });
    it('drops team filters when the account no longer has management access', () => {
        writeBoardWorkspace('scope', { filters: view, views: [view] });
        const workspace = readBoardWorkspace('scope', false);
        expect(workspace.filters.filterUserId).toBeUndefined();
        expect(workspace.views[0].filterUserId).toBeUndefined();
        expect(workspace.filters.compact).toBe(true);
    });
    it('tolerates corrupt data, duplicate identifiers and invalid ranges', () => {
        data.set('scope', '{bad json');
        expect(readBoardWorkspace('scope', true).views).toEqual([]);
        data.set('scope', JSON.stringify({ filters: { filterUserId: -4 }, views: [view, view, { ...view, id: 'b'.repeat(32), range: { start: '2026-02-31', end: '2026-03-01' } }] }));
        expect(readBoardWorkspace('scope', true).views).toHaveLength(1);
        expect(readBoardWorkspace('scope', true).filters.filterUserId).toBeUndefined();
    });
    it('preserves a rolling date range rather than freezing its calendar dates', () => {
        const range = snapshotViewRange({ start: new Date(2026, 9, 10), end: new Date(2026, 9, 16) }, new Date(2026, 9, 16));
        expect(range).toEqual({ days: 7 });
        const nextDay = resolveViewRange(range, new Date(2026, 9, 17));
        expect(format(nextDay.start, 'yyyy-MM-dd')).toBe('2026-10-11');
        expect(format(nextDay.end, 'yyyy-MM-dd')).toBe('2026-10-17');
    });
    it('preserves custom historical date ranges', () => {
        expect(snapshotViewRange({ start: new Date(2026, 8, 1), end: new Date(2026, 8, 3) }, new Date(2026, 9, 16))).toEqual({ start: '2026-09-01', end: '2026-09-03' });
    });
    it('keeps the page usable if browser storage is blocked', () => {
        storage.getItem.mockImplementationOnce(() => { throw new Error('Blocked'); });
        expect(readBoardWorkspace('scope', true).views).toEqual([]);
        storage.setItem.mockImplementationOnce(() => { throw new Error('Quota'); });
        expect(writeBoardWorkspace('scope', { filters: view, views: [view] })).toBe(false);
    });
});
