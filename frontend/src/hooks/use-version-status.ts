import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { systemApi, type VersionStatus } from '@/api/system';

export const VERSION_QUERY_KEY = ['version-status'] as const;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const STALE_TIME_MS = 5 * 60 * 1000;

interface VersionStatusSnapshot {
  data: VersionStatus;
  backendUpgraded: boolean;
}

export function useVersionStatus(enabled = true) {
  const initialBackendVersion = useRef<string | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery<VersionStatus, Error, VersionStatusSnapshot>({
    queryKey: VERSION_QUERY_KEY,
    queryFn: systemApi.getVersionStatus,
    enabled,
    staleTime: STALE_TIME_MS,
    refetchInterval: enabled ? POLL_INTERVAL_MS : false,
    refetchOnReconnect: enabled,
    retry: enabled ? 1 : false,
    select: (data) => {
      const baselineVersion = initialBackendVersion.current;

      if (baselineVersion === null) {
        initialBackendVersion.current = data.currentVersion;
        return { data, backendUpgraded: false };
      }

      return {
        data,
        backendUpgraded: data.currentVersion !== baselineVersion,
      };
    },
  });

  const refreshMutation = useMutation({
    mutationFn: systemApi.refreshVersionStatus,
    onSuccess: (data) => {
      queryClient.setQueryData(VERSION_QUERY_KEY, data);
    },
  });

  return {
    data: query.data?.data ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error ?? refreshMutation.error ?? null,
    backendUpgraded: query.data?.backendUpgraded ?? false,
    refresh: refreshMutation.mutateAsync,
    isRefreshing: refreshMutation.isPending,
  };
}
