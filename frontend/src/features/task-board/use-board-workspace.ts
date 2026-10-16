import { useEffect, useState } from 'react';
import { readBoardWorkspace, writeBoardWorkspace, sanitizeBoardFilters, newBoardViewId, type BoardFilters, type SavedBoardView } from './lib/board-views';

export function useBoardWorkspace(key: string, teamFilters: boolean) {
    // The page is keyed by account and site, so each scope gets its own state.
    const [workspace, setWorkspace] = useState(() => readBoardWorkspace(key, teamFilters));
    const [isPersisted, setIsPersisted] = useState(true);
    useEffect(() => {
        const saved = writeBoardWorkspace(key, workspace);
        // Synchronize the result of writing to browser storage.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsPersisted(saved);
    }, [key, workspace]);
    const setFilters = (change: Partial<BoardFilters>) => setWorkspace(current => ({ ...current, filters: sanitizeBoardFilters({ ...current.filters, ...change }, teamFilters) }));
    const saveView = (view: Omit<SavedBoardView, 'id'>): 'duplicate' | 'limit' | undefined => {
        if (workspace.views.some(saved => saved.name.toLocaleLowerCase() === view.name.trim().toLocaleLowerCase())) return 'duplicate';
        if (workspace.views.length >= 20) return 'limit';
        const id = newBoardViewId();
        setWorkspace(current => ({ ...current, views: [...current.views, { ...view, id, name: view.name.trim().slice(0, 60) }] }));
    };
    const deleteView = (id: string) => setWorkspace(current => ({ ...current, views: current.views.filter(view => view.id !== id) }));
    return { ...workspace, setFilters, saveView, deleteView, isPersisted };
}
