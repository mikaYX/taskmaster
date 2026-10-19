// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { http, ApiError } from './http';

describe('http module', () => {
    let originalFetch: typeof fetch;
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        originalFetch = globalThis.fetch;
        mockFetch = vi.fn();
        globalThis.fetch = mockFetch as unknown as typeof fetch;

        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/',
                href: 'http://localhost/',
            },
            writable: true,
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('retry conserve params across retries sans header Authorization', async () => {
        let testCallCount = 0;

        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
            const urlStr = url.toString();

            if (urlStr.includes('/test?foo=bar')) {
                testCallCount += 1;
                const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
                expect(authHeader).toBeUndefined();

                if (testCallCount === 1) {
                    return new Response(null, { status: 401 });
                }

                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }

            if (urlStr.includes('/auth/refresh')) {
                expect(init).toEqual(expect.objectContaining({
                    method: 'POST',
                    credentials: 'include',
                }));
                return new Response(JSON.stringify({ expiresIn: 900 }), { status: 200 });
            }

            return new Response(null, { status: 404 });
        });

        const result = await http.get('/test', { params: { foo: 'bar' } });
        expect(result).toEqual({ success: true });

        expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/test?foo=bar'),
            expect.any(Object),
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
            3,
            expect.stringContaining('/test?foo=bar'),
            expect.any(Object),
        );
    });

    it('refresh unique sous 401 simultanes (deduplication)', async () => {
        let refreshCount = 0;

        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) => {
            const urlStr = url.toString();

            if (urlStr.includes('/auth/refresh')) {
                refreshCount += 1;
                await new Promise((resolve) => setTimeout(resolve, 50));
                return new Response(JSON.stringify({ expiresIn: 900 }), { status: 200 });
            }

            if (urlStr.includes('/test/')) {
                if (refreshCount === 0) {
                    return new Response(null, { status: 401 });
                }

                return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
            }

            return new Response(null, { status: 404 });
        });

        const results = await Promise.all([
            http.get('/test/1'),
            http.get('/test/2'),
            http.get('/test/3'),
        ]);

        expect(results).toEqual([{ data: 'ok' }, { data: 'ok' }, { data: 'ok' }]);
        expect(refreshCount).toBe(1);
    });

    it('comportement distinct auth-invalide vs erreur transitoire', async () => {
        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) => {
            const urlStr = url.toString();

            if (urlStr.includes('/test-auth-invalid')) {
                return new Response(null, { status: 401, statusText: 'Unauthorized' });
            }

            if (urlStr.includes('/auth/refresh')) {
                return new Response(null, { status: 403, statusText: 'Forbidden' });
            }

            return new Response(null, { status: 404 });
        });

        await expect(http.get('/test-auth-invalid')).rejects.toMatchObject({
            status: 401,
            data: { code: 'session_expired' },
        } satisfies Partial<ApiError>);

        expect(window.location.href).toBe('/login');

        window.location.href = 'http://localhost/';

        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) => {
            const urlStr = url.toString();

            if (urlStr.includes('/test-transient')) {
                return new Response(null, { status: 401, statusText: 'Unauthorized' });
            }

            if (urlStr.includes('/auth/refresh')) {
                return new Response(null, { status: 500, statusText: 'Internal Server Error' });
            }

            return new Response(null, { status: 404 });
        });

        vi.useFakeTimers();
        const outcome = expect(http.get('/test-transient')).rejects.toMatchObject({
            status: 503,
            data: { code: 'session_refresh_unavailable' },
        } satisfies Partial<ApiError>);
        await vi.advanceTimersByTimeAsync(5_000);
        await outcome;
        vi.useRealTimers();

        // Not a 401: the session query signs the user out on 401/403 only.
        expect(window.location.href).toBe('http://localhost/');
    });

    describe('overlapping refreshes (two tabs, a retry) never sign the user out', () => {
        afterEach(() => {
            vi.useRealTimers();
        });

        it('retries after a 409 "refresh in progress" and succeeds once the other request is done', async () => {
            vi.useFakeTimers();
            let refreshCalls = 0;
            let dataCalls = 0;

            mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) => {
                const urlStr = url.toString();
                if (urlStr.includes('/auth/refresh')) {
                    refreshCalls += 1;
                    // The first attempt collides with the other tab's rotation.
                    return refreshCalls === 1
                        ? new Response(JSON.stringify({ error: 'Refresh already in progress' }), { status: 409 })
                        : new Response(JSON.stringify({ expiresIn: 900 }), { status: 200 });
                }
                dataCalls += 1;
                return dataCalls === 1
                    ? new Response(null, { status: 401 })
                    : new Response(JSON.stringify({ ok: true }), { status: 200 });
            });

            const result = http.get('/data');
            await vi.advanceTimersByTimeAsync(2_000);

            await expect(result).resolves.toEqual({ ok: true });
            expect(refreshCalls).toBe(2);
            expect(window.location.href).toBe('http://localhost/');
        });

        it('does not redirect to the login page while the refresh keeps failing transiently', async () => {
            vi.useFakeTimers();
            mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) =>
                url.toString().includes('/auth/refresh')
                    ? new Response(null, { status: 409 })
                    : new Response(null, { status: 401 }),
            );

            const outcome = expect(http.get('/data')).rejects.toMatchObject({ status: 503 });
            await vi.advanceTimersByTimeAsync(5_000);
            await outcome;

            expect(window.location.href).toBe('http://localhost/');
        });

        it('still signs out when the refresh token is really gone (401 on refresh)', async () => {
            mockFetch.mockImplementation(async (url: string | URL | globalThis.Request) =>
                url.toString().includes('/auth/refresh')
                    ? new Response(null, { status: 401 })
                    : new Response(null, { status: 401 }),
            );

            await expect(http.get('/data')).rejects.toMatchObject({
                status: 401,
                data: { code: 'session_expired' },
            });
            expect(window.location.href).toBe('/login');
        });
    });
});
