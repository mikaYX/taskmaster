import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { useQueryClient } from '@tanstack/react-query';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Building2 } from 'lucide-react';

export function SiteSelector() {
    const { t } = useTranslation();
    const role = useAuthStore((s) => s.role);
    const sites = useAuthStore((s) => s.sites);
    const currentSiteId = useSiteStore((s) => s.currentSiteId);
    const setCurrentSiteId = useSiteStore((s) => s.setCurrentSiteId);
    const queryClient = useQueryClient();

    if (!sites || sites.length <= 1) return null;

    const isSuperAdmin = role === 'SUPER_ADMIN';

    return (
        <Select
            // For a super administrator no site chosen means all of them.
            value={currentSiteId?.toString() ?? (isSuperAdmin ? 'all' : '')}
            onValueChange={(val) => {
                setCurrentSiteId(val === 'all' ? null : parseInt(val, 10));
                // Force un rechargement de toutes les requêtes actives pour rafraîchir les données
                queryClient.invalidateQueries();
            }}
        >
            <SelectTrigger className="h-10 w-auto gap-2 rounded-full bg-card px-3.5 text-sm font-medium shadow-sm sm:w-[200px] max-sm:[&>[data-slot=select-value]]:!hidden max-sm:[&>svg:last-child]:!hidden [&>[data-slot=select-value]]:flex-1 [&>[data-slot=select-value]]:justify-start" id="site-selector" aria-label={t('sites.selectSite')}>
                <Building2 className="h-4 w-4 shrink-0 text-primary" />
                <SelectValue placeholder={t('sites.selectSite')} />
            </SelectTrigger>
            <SelectContent>
                {isSuperAdmin && (
                    <SelectItem value="all">
                        {t('sites.allSites')}
                    </SelectItem>
                )}
                {sites.map((site) => (
                    <SelectItem key={site.siteId} value={site.siteId.toString()}>
                        {site.siteName}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
