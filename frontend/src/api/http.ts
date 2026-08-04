import { useSiteStore } from '@/stores/site-store';

/**
 * API Error class for typed error handling.
 */
export class ApiError extends Error {
    readonly status: number;
    readonly statusText: string;
    readonly data?: unknown;

    constructor(status: number, statusText: string, data?: unknown) {
        super(`API Error: ${status} ${statusText}`);
        this.name = 'ApiError';
        this.status = status;
        this.statusText = statusText;
        this.data = data;
    }
}

/**
 * Base HTTP client configuration.
 */
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

/**
 * Extended request options to support 'params' for query string.
 */
interface ExtendedRequestInit extends RequestInit {
    params?: Record<string, string | number | boolean | undefined>;
    responseType?: 'json' | 'blob';
    /**
     * Per-request timeout in milliseconds. Pass 0 to disable.
     * Defaults to DEFAULT_TIMEOUT_MS (30 s) for normal calls and to
     * UPLOAD_TIMEOUT_MS (5 min) when the body is a FormData (uploads).
     */
    timeoutMs?: number;
    _isRetry?: boolean; // Internal flag to prevent infinite retry loops
}

/** Default request timeout (ms). Override via `options.timeoutMs`. */
const DEFAULT_TIMEOUT_MS = 30_000;
/** Default timeout for FormData (uploads) requests. */
const UPLOAD_TIMEOUT_MS = 5 * 60_000;
/** Timeout dedicated to the silent token refresh roundtrip. */
const REFRESH_TIMEOUT_MS = 10_000;

/**
 * Combine an optional user signal with a timeout signal.
 * Falls back to a manual AbortController when AbortSignal.any is unavailable.
 */
function buildAbortSignal(
    userSignal: AbortSignal | null | undefined,
    timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
    if (timeoutMs <= 0) {
        return { signal: userSignal ?? new AbortController().signal, cleanup: () => {} };
    }
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    if (!userSignal) {
        return { signal: timeoutSignal, cleanup: () => {} };
    }
    // Prefer the standard combiner when available (Chrome 116+, Firefox 124+, Safari 17.4+).
    const combiner = (AbortSignal as unknown as { any?: (sigs: AbortSignal[]) => AbortSignal }).any;
    if (typeof combiner === 'function') {
        return { signal: combiner([userSignal, timeoutSignal]), cleanup: () => {} };
    }
    // Fallback for older engines.
    const controller = new AbortController();
    const onAbort = (reason: unknown) => controller.abort(reason);
    const onUser = () => onAbort((userSignal as AbortSignal).reason);
    const onTimeout = () => onAbort(timeoutSignal.reason);
    if (userSignal.aborted) onUser();
    else userSignal.addEventListener('abort', onUser, { once: true });
    if (timeoutSignal.aborted) onTimeout();
    else timeoutSignal.addEventListener('abort', onTimeout, { once: true });
    return {
        signal: controller.signal,
        cleanup: () => {
            userSignal.removeEventListener('abort', onUser);
            timeoutSignal.removeEventListener('abort', onTimeout);
        },
    };
}

/**
 * Flag to prevent multiple simultaneous refresh attempts.
 */
let isRefreshing = false;

type RefreshResult = 'success' | 'auth_invalid' | 'transient_error';
let refreshPromise: Promise<RefreshResult> | null = null;

/**
 * Attempt to refresh the access token.
 * The refresh token is stored as an HttpOnly cookie (set by the backend on login/refresh).
 * The browser sends it automatically via credentials: 'include' — no localStorage needed.
 */
async function refreshAccessToken(): Promise<RefreshResult> {
    try {
        const response = await fetch(`${BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
            },
            credentials: 'include',
            signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return 'auth_invalid';
            }
            return 'transient_error';
        }
        return 'success';
    } catch {
        return 'transient_error';
    }
}

/**
 * Handle token refresh with deduplication.
 * Multiple concurrent 401s will share the same refresh attempt.
 */
/**
 * Handle token refresh with deduplication and cross-tab coordination.
 * Uses Web Locks API to prevent multiple tabs from rotating the token simultaneously.
 */
async function handleTokenRefresh(): Promise<RefreshResult> {
    // In-memory deduplication (same tab)
    if (isRefreshing && refreshPromise) {
        return refreshPromise;
    }

    isRefreshing = true;

    // Cross-tab coordination via Web Locks — prevents multiple tabs from rotating the token simultaneously
    refreshPromise = new Promise<RefreshResult>((resolve) => {
        if ('locks' in navigator) {
            navigator.locks.request('auth_refresh', async () => {
                return await refreshAccessToken();
            }).then(resolve).catch(() => resolve('transient_error'));
        } else {
            // Fallback for browsers without Web Locks
            refreshAccessToken().then(resolve).catch(() => resolve('transient_error'));
        }
    }).finally(() => {
        isRefreshing = false;
        refreshPromise = null;
    });

    return refreshPromise!;
}

/**
 * Clear auth state and redirect to login.
 */
function handleAuthFailure(): void {
    // Only redirect if not already on login page
    if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
    }
}

/**
 * Centralized HTTP client.
 *
 * Features:
 * - credentials: 'include' for HttpOnly cookies
 * - JSON content type
 * - Centralized error handling
 * - Query params support via 'params' option
 * - Automatic token refresh on 401
 */
async function request<T>(
    endpoint: string,
    options: ExtendedRequestInit = {},
): Promise<T> {
    let url = `${BASE_URL}${endpoint}`;

    // Destructure options to avoid mutating the original object and remove custom properties from fetch config
    const { params, _isRetry, responseType, timeoutMs, signal, ...fetchOptions } = options;

    // Handle Query Params
    if (params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                searchParams.append(key, String(value));
            }
        });
        const queryString = searchParams.toString();
        if (queryString) {
            url += (url.includes('?') ? '&' : '?') + queryString;
        }
    }

    const isFormData = fetchOptions.body instanceof FormData;

    const currentSiteId = useSiteStore.getState().currentSiteId;

    const headers: HeadersInit = {
        ...(currentSiteId != null ? { 'X-Site-Id': String(currentSiteId) } : {}),
        ...fetchOptions.headers,
    };

    const headersRecord = headers as Record<string, string>;
    if (isFormData) {
        // Let the browser set Content-Type with boundary; never override for FormData
        delete headersRecord['Content-Type'];
    } else if (!headersRecord['Content-Type']) {
        headersRecord['Content-Type'] = 'application/json';
    }

    // Per-request timeout. Defaults are generous for uploads.
    const effectiveTimeout =
        typeof timeoutMs === 'number'
            ? timeoutMs
            : isFormData
                ? UPLOAD_TIMEOUT_MS
                : DEFAULT_TIMEOUT_MS;
    const { signal: combinedSignal, cleanup: cleanupSignal } = buildAbortSignal(signal, effectiveTimeout);

    const config: RequestInit = {
        ...fetchOptions,
        credentials: 'include',
        headers,
        signal: combinedSignal,
    };

    let response: Response;
    try {
        response = await fetch(url, config);
    } catch (err) {
        cleanupSignal();
        // Map AbortSignal.timeout / manual abort to a clean ApiError(408)
        if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
            const reason = (combinedSignal as AbortSignal).reason;
            const isTimeout = err.name === 'TimeoutError' || (reason instanceof DOMException && reason.name === 'TimeoutError');
            if (isTimeout) {
                throw new ApiError(408, 'Request Timeout', { code: 'timeout', timeoutMs: effectiveTimeout });
            }
        }
        throw err;
    }
    cleanupSignal();

    if (!response.ok) {
        // Handle 401 Unauthorized - attempt token refresh
        // STRICTLY exclude login and refresh endpoints to prevent infinite loops
        const isAuthEndpoint = endpoint === '/auth/login' || endpoint === '/auth/refresh';

        if (response.status === 401 && !_isRetry && !isAuthEndpoint) {
            const refreshStatus = await handleTokenRefresh();

            if (refreshStatus === 'success') {
                return request<T>(endpoint, { ...options, _isRetry: true });
            } else if (refreshStatus === 'auth_invalid') {
                handleAuthFailure();
                throw new ApiError(401, 'Unauthorized', { code: 'session_expired' });
            }
            // Transient error: do not logout, fall through to throw ApiError below
        }

        let data: unknown;
        try {
            data = await response.json();
        } catch {
            data = undefined;
        }
        throw new ApiError(response.status, response.statusText, data);
    }

    // Handle 204 No Content
    if (response.status === 204) {
        return undefined as T;
    }

    // Handle Blob response
    if (responseType === 'blob') {
        return response.blob() as Promise<T>;
    }

    return response.json();
}

/**
 * HTTP methods.
 */
export const http = {
    get: <T>(endpoint: string, options?: ExtendedRequestInit) => request<T>(endpoint, { method: 'GET', ...options }),

    post: <T>(endpoint: string, body?: unknown, options?: ExtendedRequestInit) =>
        request<T>(endpoint, {
            method: 'POST',
            body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
            ...options,
        }),

    put: <T>(endpoint: string, body: unknown, options?: ExtendedRequestInit) =>
        request<T>(endpoint, {
            method: 'PUT',
            body: body instanceof FormData ? body : JSON.stringify(body),
            ...options,
        }),

    patch: <T>(endpoint: string, body?: unknown, options?: ExtendedRequestInit) =>
        request<T>(endpoint, {
            method: 'PATCH',
            body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
            ...options,
        }),

    delete: <T>(endpoint: string, body?: unknown, options?: ExtendedRequestInit) =>
        request<T>(endpoint, {
            method: 'DELETE',
            body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined),
            ...options,
        }),
};

export default http;
