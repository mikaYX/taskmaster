import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Navigate, useLocation } from 'react-router-dom';
import { useIsAuthenticated, useAuthLoading, useAuthStore } from '@/stores';
import { Skeleton } from '@/components/ui/skeleton';

interface AuthGuardProps {
    children: React.ReactNode;
}

/**
 * Auth Guard.
 * 
 * Protects routes that require authentication.
 * Shows loading skeleton while checking session.
 */
export function AuthGuard({ children }: AuthGuardProps) {
    const isAuthenticated = useIsAuthenticated();
    const isLoading = useAuthLoading();
    const location = useLocation();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <div className="space-y-4 w-64">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return <>{children}</>;
}

/**
 * Guest Guard.
 * 
 * Redirects authenticated users away from login page.
 */
export function GuestGuard({ children }: AuthGuardProps) {
    const isAuthenticated = useIsAuthenticated();
    const isLoading = useAuthLoading();

    if (isLoading) {
        return (
            <div className="flex min-h-screen items-center justify-center">
                <Skeleton className="h-12 w-12 rounded-lg" />
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

/**
 * NoGuest Guard.
 * 
 * Redirects GUEST users away from protected pages.
 */
export function NoGuestGuard({ children }: AuthGuardProps) {
    const isGuest = useAuthStore((state) => state.role === 'GUEST');

    if (isGuest) {
        return <Navigate to="/" replace />;
    }

    return <>{children}</>;
}

/** Mirrors the existing server restriction on settings, backups and audit. */
export function SuperAdminGuard({ children }: AuthGuardProps) {
    const role = useAuthStore(state => state.role);
    const { t } = useTranslation();
    if (role !== 'SUPER_ADMIN') return <section role="alert" className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('access.deniedTitle')}</h1>
        <p>{t('access.deniedDescription')}</p>
        <Button asChild><Link to="/">{t('access.backToBoard')}</Link></Button>
    </section>;
    return <>{children}</>;
}
