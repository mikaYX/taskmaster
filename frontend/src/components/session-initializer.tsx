import { useEffect } from 'react';
import { useSession } from '@/hooks/use-auth';
import { useSetupStatus } from '@/hooks/use-setup-status';
import { useAuthStore } from '@/stores';

/**
 * Session Initializer.
 *
 * Component that fetches session on mount, but only if setup is complete.
 * Should be placed inside QueryProvider and BrowserRouter.
 */
export function SessionInitializer({ children }: { children: React.ReactNode }) {
    const { data: setupStatus, isLoading: isLoadingSetup } = useSetupStatus();
    const clearSession = useAuthStore((state) => state.clearSession);

    // Only enable session fetch if setup is complete
    // Setup is complete when: not loading AND setup status exists AND needsSetup is false
    const shouldFetchSession = !isLoadingSetup && !!setupStatus && setupStatus.needsSetup === false;

    useSession(shouldFetchSession);

    // Clear session state when setup is needed to ensure isLoading is false
    useEffect(() => {
        if (!isLoadingSetup && setupStatus?.needsSetup) {
            clearSession();
        }
    }, [isLoadingSetup, setupStatus, clearSession]);

    return <>{children}</>;
}
