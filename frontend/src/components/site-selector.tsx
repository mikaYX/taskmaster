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
            value={currentSiteId?.toString() ?? ''}
            onValueChange={(val) => {
                setCurrentSiteId(val === 'all' ? null : parseInt(val, 10));
                // Force un rechargement de toutes les requêtes actives pour rafraîchir les données
                queryClient.invalidateQueries();
            }}
        >
            <SelectTrigger className="w-[180px] h-9" id="site-selector">
                <Building2 className="mr-2 h-4 w-4 shrink-0 opacity-50" />
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
