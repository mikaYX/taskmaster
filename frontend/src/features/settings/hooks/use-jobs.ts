import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { jobsApi } from '@/api/jobs';
import { toast } from 'sonner';

export function useJobs() {
    const queryClient = useQueryClient();

    // Fetch all system jobs
    const jobsQuery = useQuery({
        queryKey: ['system-jobs'],
        queryFn: jobsApi.getAll,
    });

    // Run Job
    const runMutation = useMutation({
        mutationFn: (name: string) => jobsApi.run(name),
        onSuccess: (data) => {
            toast.success(data.message);
        },
        onError: () => {
            toast.error('Failed to run job');
        },
    });

    // Toggle Job
    const toggleMutation = useMutation({
        mutationFn: (name: string) => jobsApi.toggle(name),
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['system-jobs'] });
            toast.success(data.message);
        },
        onError: () => {
            toast.error('Failed to toggle job');
        },
    });

    return {
        jobs: jobsQuery.data,
        isLoading: jobsQuery.isLoading,
        isError: jobsQuery.isError,
        refetch: jobsQuery.refetch,

        runJob: runMutation.mutate,
        toggleJob: toggleMutation.mutate,

        isRunning: runMutation.isPending,
        isToggling: toggleMutation.isPending,
    };
}
