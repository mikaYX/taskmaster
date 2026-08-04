
import { useState, useEffect, useCallback, useRef } from 'react';
import { systemApi } from '@/api/system';
import { ApiError } from '@/api/http';

export type SystemStatus = 'unknown' | 'ok' | 'unavailable';

export function useSystemHealth() {
    const [status, setStatus] = useState<SystemStatus>('unknown');
    const [isLoading, setIsLoading] = useState(true);
    const retryCount = useRef(0);
    const maxRetries = 10; // ~20 seconds of grace period
    // Holds the latest `checkHealth` so the retry timeout below can call it
    // recursively without referencing the `checkHealth` binding before it's
    // fully declared (react-hooks/immutability).
    const checkHealthRef = useRef<((isManualRetry?: boolean) => Promise<void>) | undefined>(undefined);

    const checkHealth = useCallback(async (isManualRetry = false) => {
        if (isManualRetry) {
            setIsLoading(true);
            retryCount.current = 0;
        }

        try {
            const response = await systemApi.checkHealth();

            if (response && response.db === 'down') {
                throw new Error('Database reported down');
            }
            setStatus('ok');
            setIsLoading(false);
            retryCount.current = 0;
        } catch (error) {
            // A forbidden health endpoint still proves the backend is reachable.
            // This happens in Docker deployments where /health is intentionally
            // guarded from browser-originated requests.
            if (error instanceof ApiError && error.status === 403) {
                setStatus('ok');
                setIsLoading(false);
                retryCount.current = 0;
                return;
            }

            // Only log if manual or final failure to avoid console noise
            if (isManualRetry || retryCount.current >= maxRetries) {
                console.error('System health check failed:', error);
            }

            if (retryCount.current < maxRetries) {
                retryCount.current++;
                setTimeout(() => checkHealthRef.current?.(), 2000);
            } else {
                setStatus('unavailable');
                setIsLoading(false);
            }
        }
    }, []);

    // Refs must not be written during render — keep the ref updated after each
    // commit instead (react-hooks/refs).
    useEffect(() => {
        checkHealthRef.current = checkHealth;
    });

    // Initial check — one-shot on mount, not a derived-state sync.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        checkHealth();
        return () => { retryCount.current = maxRetries + 1; }; // Prevent retries after unmount
    }, [checkHealth]);

    const manualRetry = useCallback(() => checkHealth(true), [checkHealth]);

    return { status, checkHealth: manualRetry, isLoading };
}
