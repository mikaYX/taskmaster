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
    _isRetry?: boolean; // Internal flag to prevent infinite retry loops
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
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                return 'auth_invalid';
            }
            return 'transient_error';
        }

        const data = await response.json();

        if (data.accessToken) {
            localStorage.setItem('accessToken', data.accessToken);
            return 'success';
        }

        return 'auth_invalid';
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
    localStorage.removeItem('accessToken');

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
    const { params, _isRetry, responseType, ...fetchOptions } = options;

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

    const token = localStorage.getItem('accessToken');
    const isFormData = fetchOptions.body instanceof FormData;

    const currentSiteId = useSiteStore.getState().currentSiteId;

    const headers: HeadersInit = {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

    const config: RequestInit = {
        ...fetchOptions,
        credentials: 'include',
        headers,
    };

    const response = await fetch(url, config);

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
