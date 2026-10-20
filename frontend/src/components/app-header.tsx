import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { format } from 'date-fns';
import {
    BarChart3,
    CheckSquare,
    ClipboardList,
    Database,
    Download,
    LayoutDashboard,
    ScrollText,
    Settings2,
    ShieldCheck,
    Sparkles,
    User,
    Archive,
    type LucideIcon,
} from 'lucide-react';
import { titleKeyForPath } from '@/lib/route-titles';
import { getDateLocale } from '@/lib/date-locale';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageToggle } from '@/components/language-toggle';
import { Separator } from '@/components/ui/separator';
import { SiteSelector } from '@/components/site-selector';
import { NotificationBell } from '@/components/notification-bell';

/** Icon of each page title, the same as in the sidebar and the page headers. */
const TITLE_ICONS: Record<string, LucideIcon> = {
    'nav.taskBoard': LayoutDashboard,
    'nav.correctiveActions': ShieldCheck,
    'nav.todoList': CheckSquare,
    'nav.analytics': BarChart3,
    'nav.taskDefinitions': ClipboardList,
    'taskWizard.title': Sparkles,
    'taskArchive.title': Archive,
    'nav.settings': Settings2,
    'nav.exports': Download,
    'nav.backups': Database,
    'nav.auditLog': ScrollText,
    'profile.myProfile': User,
};

interface AppHeaderProps {
    titleKey?: string;
    subtitleKey?: string;
    /** The notification center only has something to show with the todo list on. */
    showNotifications?: boolean;
}

export function AppHeader({ titleKey, subtitleKey, showNotifications = false }: AppHeaderProps) {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const key = titleKey ?? titleKeyForPath(pathname);
    const Icon = TITLE_ICONS[key] ?? LayoutDashboard;

    return (
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-background/80 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-5">
            <SidebarTrigger className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground [&_svg]:size-5" />
            <Separator orientation="vertical" className="hidden h-6 sm:block" />

            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-primary shadow-sm ring-1 ring-primary/10 sm:flex">
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                    <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{t(key)}</h1>
                    <p className="hidden truncate text-xs capitalize text-muted-foreground sm:block">
                        {subtitleKey ? t(subtitleKey) : format(new Date(), 'EEEE d MMMM', { locale: getDateLocale() })}
                    </p>
                </div>
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
