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
 * Home of a TV account. A screen bound to the analytics lands there instead of on
 * the task board; everybody else (including a screen bound to the board) is left
 * where they are.
 */
export function BoardGate({ children }: AuthGuardProps) {
    const isAnalyticsScreen = useAuthStore((state) => state.role === 'GUEST' && state.guestView === 'ANALYTICS');

    if (isAnalyticsScreen) {
        return <Navigate to="/analytics" replace />;
    }

    return <>{children}</>;
}

/**
 * Analytics: everybody who may see them, plus a TV account bound to the analytics.
 * A TV account bound to the board goes back to it.
 */
export function AnalyticsGuard({ children }: AuthGuardProps) {
    const isBoardScreen = useAuthStore((state) => state.role === 'GUEST' && state.guestView !== 'ANALYTICS');

    if (isBoardScreen) {
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

/**
 * Super administrators and managers. The server limits what a manager can do
 * to the accounts of their own sites.
 */
export function ManagerGuard({ children }: AuthGuardProps) {
    const role = useAuthStore(state => state.role);
    const { t } = useTranslation();
    if (role !== 'SUPER_ADMIN' && role !== 'MANAGER') return <section role="alert" className="mx-auto max-w-xl space-y-4 p-6">
        <h1 className="text-xl font-semibold">{t('access.deniedTitle')}</h1>
        <p>{t('access.deniedDescription')}</p>
        <Button asChild><Link to="/">{t('access.backToBoard')}</Link></Button>
    </section>;
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
