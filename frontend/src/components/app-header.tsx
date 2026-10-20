import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { titleKeyForPath } from '@/lib/route-titles';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { Separator } from '@/components/ui/separator';
import { SiteSelector } from '@/components/site-selector';
import { NotificationBell } from '@/components/notification-bell';

interface AppHeaderProps {
    titleKey?: string;
    subtitleKey?: string;
    /** The notification center only has something to show with the todo list on. */
    showNotifications?: boolean;
}

export function AppHeader({ titleKey, subtitleKey, showNotifications = false }: AppHeaderProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();

    return (
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />

            <div className="flex-1">
                <h1 className="text-lg font-semibold flex items-center">
                    {t(titleKey ?? titleKeyForPath(pathname))}
                </h1>
                {subtitleKey && (
                    <p className="text-sm text-muted-foreground">{t(subtitleKey)}</p>
                )}
            </div>

            <div className="flex items-center gap-2">
                <SiteSelector />
                {showNotifications && <NotificationBell />}
                <LanguageToggle />
                <ThemeToggle />
            </div>
        </header>
    );
}
