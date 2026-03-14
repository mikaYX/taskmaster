import { useQuery } from '@tanstack/react-query';
import { setupApi } from '@/api';

/**
 * Hook to check if initial setup is needed.
 */
export function useSetupStatus() {
    return useQuery({
        queryKey: ['setup', 'status'],
        queryFn: () => setupApi.getStatus(),
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: false,
    });
}
