import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';

/**
 * Ne retente pas les erreurs client (4xx) — inutile de réessayer une requête
 * malformée ou non autorisée. Retente jusqu'à 3 fois les erreurs réseau / 5xx.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
    if (error && typeof error === 'object' && 'status' in error) {
        const status = (error as { status: number }).status;
        if (status >= 400 && status < 500) return false;
    }
    return failureCount < 3;
}

/**
 * Query Client Configuration.
 *
 * - retry : logique adaptative (0 sur 4xx, ×3 sur réseau/5xx)
 * - retryDelay : backoff exponentiel plafonné à 30 s
 * - networkMode : les requêtes se mettent en pause hors ligne et reprennent
 *   automatiquement à la reconnexion (refetchOnReconnect)
 */
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 60 * 1000,
            retry: shouldRetry,
            retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 30_000),
            networkMode: 'online',
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
        },
        mutations: {
            retry: 0,
        },
    },
});

interface QueryProviderProps {
    children: ReactNode;
}

/**
 * Query Provider.
 * 
 * Wraps React Query client provider.
 */
export function QueryProvider({ children }: QueryProviderProps) {
    return (
        <QueryClientProvider client={queryClient}>
            {children}
            {/* DevTools uniquement en développement — absent du bundle de production */}
            {import.meta.env.DEV && (
                <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
            )}
        </QueryClientProvider>
    );
}

export { queryClient };
