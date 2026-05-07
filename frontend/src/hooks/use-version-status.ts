import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { systemApi, type VersionStatus } from '@/api/system';

const VERSION_QUERY_KEY = ['version-status'] as const;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const STALE_TIME_MS = 5 * 60 * 1000;

interface VersionStatusSnapshot {
  data: VersionStatus;
  backendUpgraded: boolean;
}

export function useVersionStatus() {
  const initialBackendVersion = useRef<string | null>(null);

  const query = useQuery<VersionStatus, Error, VersionStatusSnapshot>({
    queryKey: VERSION_QUERY_KEY,
    queryFn: systemApi.getVersionStatus,
    staleTime: STALE_TIME_MS,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnReconnect: true,
    retry: 1,
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
  return {
    data: query.data?.data ?? null,
    isLoading: query.isLoading,
    backendUpgraded: query.data?.backendUpgraded ?? false,
  };
}
