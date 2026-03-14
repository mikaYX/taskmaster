import { Navigate } from 'react-router-dom';
import { useSetupStatus } from '@/hooks';
import { Skeleton } from '@/components/ui/skeleton';

interface SetupGuardProps {
    children: React.ReactNode;
}

/**
 * Setup Guard.
 * 
 * Checks backend if setup is needed.
 * Redirects to /setup if no admin exists.
 */
export function SetupGuard({ children }: SetupGuardProps) {
    const { data, isLoading, isError } = useSetupStatus();

    // Loading state
    if (isLoading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <Skeleton className="h-8 w-32" />
            </div>
        );
    }

    // Error state - assume setup not needed (fallback)
    if (isError) {
        return <>{children}</>;
    }

    // Redirect to setup if needed
    if (data?.needsSetup) {
        return <Navigate to="/setup" replace />;
    }

    return <>{children}</>;
}
