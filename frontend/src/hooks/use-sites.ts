import { useQuery } from '@tanstack/react-query';
import { sitesApi } from '@/api/sites';

export function useSites() {
    return useQuery({
        queryKey: ['sites'],
        queryFn: () => sitesApi.findAll(),
        staleTime: 5 * 60 * 1000,
    });
}
