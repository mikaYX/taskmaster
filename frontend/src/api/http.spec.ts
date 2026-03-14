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

        // Mock localStorage
        const store: Record<string, string> = {
            accessToken: 'token-123',
            refreshToken: 'refresh-123'
        };
        const mockLocalStorage = {
            getItem: vi.fn((key: string) => store[key] || null),
            setItem: vi.fn((key: string, value: string) => {
                store[key] = value;
            }),
            removeItem: vi.fn((key: string) => {
                delete store[key];
            }),
            clear: vi.fn(),
            length: Object.keys(store).length,
            key: vi.fn(),
        };
        vi.stubGlobal('localStorage', mockLocalStorage);

        // Mock window.location
        Object.defineProperty(window, 'location', {
            value: {
                pathname: '/',
                href: 'http://localhost/'
            },
            writable: true
        });
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('retry conserve params across retries', async () => {
        // First call fails with 401
        // Refresh call succeeds
        // Retry call succeeds

        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
            const urlStr = url.toString();
            if (urlStr.includes('/test?foo=bar')) {
                const authHeader = (init?.headers as Record<string, string>)?.Authorization;
                if (authHeader === 'Bearer token-123') {
                    // Initial failure
                    return new Response(null, { status: 401 });
                } else if (authHeader === 'Bearer new-access') {
                    // Retry success
                    return new Response(JSON.stringify({ success: true }), { status: 200 });
                }
            } else if (urlStr.includes('/auth/refresh')) {
                // Refresh success
                return new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }), { status: 200 });
            }
            return new Response(null, { status: 404 });
        });

        const result = await http.get('/test', { params: { foo: 'bar' } });
        expect(result).toEqual({ success: true });

        // Ensure refresh was called
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/auth/refresh'),
            expect.objectContaining({ method: 'POST' })
        );

        // Ensure both original and retry had params
        expect(mockFetch).toHaveBeenNthCalledWith(
            1,
            expect.stringContaining('/test?foo=bar'),
            expect.any(Object)
        );
        expect(mockFetch).toHaveBeenNthCalledWith(
            3, // 1st is get, 2nd is refresh, 3rd is retry get
            expect.stringContaining('/test?foo=bar'),
            expect.any(Object)
        );
    });

    it('refresh unique sous 401 simultanés (deduplication)', async () => {
        let refreshCount = 0;
        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request, init?: RequestInit) => {
            const urlStr = url.toString();
            if (urlStr.includes('/test')) {
                const authHeader = (init?.headers as Record<string, string>)?.Authorization;
                if (authHeader === 'Bearer token-123') {
                    return new Response(null, { status: 401 });
                } else {
                    return new Response(JSON.stringify({ data: 'ok' }), { status: 200 });
                }
            } else if (urlStr.includes('/auth/refresh')) {
                refreshCount++;
                // Add a small delay to simulate network latency and test concurrency
                await new Promise(r => setTimeout(r, 50));
                return new Response(JSON.stringify({ accessToken: 'new-access', refreshToken: 'new-refresh' }), { status: 200 });
            }
            return new Response(null, { status: 404 });
        });

        // Fire 3 simultaneous requests
        const results = await Promise.all([
            http.get('/test/1'),
            http.get('/test/2'),
            http.get('/test/3')
        ]);

        expect(results).toEqual([{ data: 'ok' }, { data: 'ok' }, { data: 'ok' }]);
        // Refresh should only be called once
        expect(refreshCount).toBe(1);
    });

    it('comportement distinct auth-invalide vs erreur transitoire', async () => {
        // Scenario 1: auth invalid (403 on refresh)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request, _init?: RequestInit) => {
            const urlStr = url.toString();
            if (urlStr.includes('/test-auth-invalid')) {
                return new Response(null, { status: 401, statusText: 'Unauthorized' });
            } else if (urlStr.includes('/auth/refresh')) {
                return new Response(null, { status: 403, statusText: 'Forbidden' });
            }
            return new Response(null, { status: 404 });
        });

        try {
            await http.get('/test-auth-invalid');
            expect.fail('Should have thrown an error');
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            if (error instanceof ApiError) {
                expect(error.status).toBe(401);
                expect(error.data).toEqual({ code: 'session_expired' });
            }
        }

        // Session should be cleared and redirect should happen
        expect(localStorage.getItem('accessToken')).toBeNull();
        expect(window.location.href).toBe('/login');

        // Reset storage for next scenario
        localStorage.setItem('accessToken', 'token-123');
        localStorage.setItem('refreshToken', 'refresh-123');
        window.location.href = 'http://localhost/'; // revert

        // Scenario 2: transient error (500 on refresh)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        mockFetch.mockImplementation(async (url: string | URL | globalThis.Request, _init?: RequestInit) => {
            const urlStr = url.toString();
            if (urlStr.includes('/test-transient')) {
                return new Response(null, { status: 401, statusText: 'Unauthorized' });
            } else if (urlStr.includes('/auth/refresh')) {
                return new Response(null, { status: 500, statusText: 'Internal Server Error' });
            }
            return new Response(null, { status: 404 });
        });

        try {
            await http.get('/test-transient');
            expect.fail('Should have thrown an error');
        } catch (error) {
            expect(error).toBeInstanceOf(ApiError);
            if (error instanceof ApiError) {
                expect(error.status).toBe(401);
            }
        }

        // Tokens should NOT be cleared on transient error
        expect(localStorage.getItem('accessToken')).toBe('token-123');
        expect(window.location.href).toBe('http://localhost/'); // no redirect
    });
});
