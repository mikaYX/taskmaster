import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'taskmaster-chunk-reload-at';
/** A second failure inside this window is a real error, not a stale page: do not reload in a loop. */
const RELOAD_GUARD_MS = 15_000;

function readReloadStamp(): number {
    try { return Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { return 0; }
}

function writeReloadStamp(value: number) {
    try { sessionStorage.setItem(RELOAD_KEY, String(value)); } catch { /* storage unavailable: the guard just does not apply */ }
}

/**
 * Loads a lazy module and, when the fetch fails ("Failed to fetch dynamically imported
 * module"), reloads the page once.
 *
 * That error is what an open tab gets when the server restarted, the machine slept or the app was
 * updated meanwhile (the old file names are gone). The browser keeps the failed import in its module
 * map, so retrying `import()` cannot work; only a reload recovers. A reload loop is prevented by a
 * short guard window, after which the error reaches the error boundary as usual.
 */
export async function loadWithReload<T>(factory: () => Promise<T>): Promise<T> {
    try {
        return await factory();
    } catch (error) {
        const now = Date.now();
        if (now - readReloadStamp() > RELOAD_GUARD_MS) {
            writeReloadStamp(now);
            window.location.reload();
            // Keep Suspense on its fallback until the reload takes over.
            return new Promise<T>(() => {});
        }
        throw error;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
    return lazy(() => loadWithReload(factory));
}
