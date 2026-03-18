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

        await expect(http.get('/test-transient')).rejects.toMatchObject({
            status: 401,
        } satisfies Partial<ApiError>);

        expect(window.location.href).toBe('http://localhost/');
    });
});
