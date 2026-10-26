import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadWithReload } from './lazy-with-retry';

describe('loadWithReload', () => {
    const reload = vi.fn();

    beforeEach(() => {
        reload.mockReset();
        sessionStorage.clear();
        vi.stubGlobal('location', { ...window.location, reload });
    });

    afterEach(() => vi.unstubAllGlobals());

    it('returns the module when the import works', async () => {
        await expect(loadWithReload(() => Promise.resolve('ok'))).resolves.toBe('ok');
        expect(reload).not.toHaveBeenCalled();
    });

    it('reloads the page once when the import fails', async () => {
        const pending = loadWithReload(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));
        await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
        // Suspense must stay on its fallback until the reload happens.
        const outcome = await Promise.race([pending.then(() => 'settled'), new Promise((r) => setTimeout(() => r('pending'), 20))]);
        expect(outcome).toBe('pending');
    });

    it('throws instead of reloading again right after a reload', async () => {
        sessionStorage.setItem('taskmaster-chunk-reload-at', String(Date.now()));
        await expect(loadWithReload(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
        expect(reload).not.toHaveBeenCalled();
    });
});
