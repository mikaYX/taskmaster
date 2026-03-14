import { useEffect, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useNetworkStatus } from '@/hooks/use-network-status';

/**
 * Bannière hors ligne.
 *
 * - Affiche une barre fixe en haut lorsque `navigator.onLine` est false.
 * - Déclenche un toast de confirmation lors du retour en ligne.
 */
export function OfflineBanner() {
    const { t } = useTranslation();
    const { isOnline } = useNetworkStatus();
    const wasOfflineRef = useRef(false);

    useEffect(() => {
        if (!isOnline) {
            wasOfflineRef.current = true;
        } else if (wasOfflineRef.current) {
            wasOfflineRef.current = false;
            toast.success(t('network.backOnline'));
        }
    }, [isOnline, t]);

    if (isOnline) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-md"
        >
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>{t('network.offline')}</span>
        </div>
    );
}
