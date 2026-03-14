
import { useState, useEffect, useCallback, useRef } from 'react';
import { systemApi } from '@/api/system';

export type SystemStatus = 'unknown' | 'ok' | 'unavailable';

export function useSystemHealth() {
    const [status, setStatus] = useState<SystemStatus>('unknown');
    const [isLoading, setIsLoading] = useState(true);
    const retryCount = useRef(0);
    const maxRetries = 10; // ~20 seconds of grace period

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
            // Only log if manual or final failure to avoid console noise
            if (isManualRetry || retryCount.current >= maxRetries) {
                console.error('System health check failed:', error);
            }

            if (retryCount.current < maxRetries) {
                retryCount.current++;
                setTimeout(() => checkHealth(), 2000);
            } else {
                setStatus('unavailable');
                setIsLoading(false);
            }
        }
    }, []);

    // Initial check
    useEffect(() => {
        checkHealth();
        return () => { retryCount.current = maxRetries + 1; }; // Prevent retries after unmount
    }, [checkHealth]);

    const manualRetry = useCallback(() => checkHealth(true), [checkHealth]);

    return { status, checkHealth: manualRetry, isLoading };
}
