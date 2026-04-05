import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { systemApi, type VersionStatus } from '@/api/system';

const VERSION_QUERY_KEY = ['version-status'] as const;
const POLL_INTERVAL_MS = 10 * 60 * 1000;
const STALE_TIME_MS = 5 * 60 * 1000;

export function useVersionStatus() {
  const [initialBackendVersion, setInitialBackendVersion] = useState<string | null>(null);

  const query = useQuery<VersionStatus>({
    queryKey: VERSION_QUERY_KEY,
    queryFn: systemApi.getVersionStatus,
    staleTime: STALE_TIME_MS,
    refetchInterval: POLL_INTERVAL_MS,
    refetchOnReconnect: true,
    retry: 1,
  });

  useEffect(() => {
    if (query.data && initialBackendVersion === null) {
      // Capture the first observed version — legitimate one-time setState
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setInitialBackendVersion(query.data.currentVersion);
    }
  }, [query.data, initialBackendVersion]);

  const backendUpgraded =
    query.data &&
    initialBackendVersion !== null &&
    query.data.currentVersion !== initialBackendVersion;

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    backendUpgraded: !!backendUpgraded,
  };
}
