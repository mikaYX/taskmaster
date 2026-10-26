import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Bell,
    CalendarClock,
    Cloud,
    Database,
    Download,
    Fingerprint,
    KeyRound,
    Mail,
    MapPin,
    Palette,
    Settings2,
    ShieldCheck,
    SlidersHorizontal,
    type LucideIcon,
} from 'lucide-react';

import { GeneralSettingsPage } from './pages/general-settings-page';
import { PersonalizationSettingsPage } from './pages/personalization-settings-page';
import { SecuritySettingsPage } from './pages/security-settings-page';
import { AuthSettingsPage } from './pages/auth-settings-page';
import { EmailSettingsPage } from './pages/email-settings-page';
import { ExportSettingsPage } from './pages/export-settings-page';
import { BackupSettingsPage } from './pages/backup-settings-page';
import { SchedulerSettingsPage } from './pages/scheduler-settings-page';
import { ApiKeysSettingsPage } from './pages/api-keys-settings-page';
import { SitesSettingsPage } from './pages/sites-settings-page';
import { NotificationsSettingsPage } from './pages/notifications-settings-page';
import { UpdatesPage } from './pages/updates-page';
import { useAuthStore } from '@/stores/auth-store';

interface SettingsTab {
    value: string;
    labelKey: string;
    descriptionKey: string;
    icon: LucideIcon;
    /** Tailwind classes of the icon tile: one colour per tab, the same in the menu and the tab header. */
    tone: string;
    render: () => React.ReactNode;
    /** Who sees the tab. */
    visible: 'all' | 'notManager' | 'superAdmin';
}

/** Tabs grouped as they appear in the menu. */
const GROUPS: { labelKey: string; tabs: SettingsTab[] }[] = [
    {
        labelKey: 'settingsShell.groups.application',
        tabs: [
            { value: 'general', labelKey: 'settings.general', descriptionKey: 'settingsShell.descriptions.general', icon: SlidersHorizontal, tone: 'bg-primary/10 text-primary', render: () => <GeneralSettingsPage />, visible: 'notManager' },
            { value: 'personalization', labelKey: 'settings.personalization', descriptionKey: 'settingsShell.descriptions.personalization', icon: Palette, tone: 'bg-pink-500/10 text-pink-700 dark:text-pink-400', render: () => <PersonalizationSettingsPage />, visible: 'notManager' },
            { value: 'sites', labelKey: 'settings.sites', descriptionKey: 'settingsShell.descriptions.sites', icon: MapPin, tone: 'bg-teal-500/10 text-teal-700 dark:text-teal-400', render: () => <SitesSettingsPage />, visible: 'superAdmin' },
            { value: 'scheduler', labelKey: 'settings.scheduler', descriptionKey: 'settingsShell.descriptions.scheduler', icon: CalendarClock, tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400', render: () => <SchedulerSettingsPage />, visible: 'notManager' },
        ],
    },
    {
        labelKey: 'settingsShell.groups.access',
        tabs: [
            { value: 'security', labelKey: 'settings.security', descriptionKey: 'settingsShell.descriptions.security', icon: ShieldCheck, tone: 'bg-violet-500/10 text-violet-700 dark:text-violet-400', render: () => <SecuritySettingsPage />, visible: 'all' },
            { value: 'auth', labelKey: 'settings.auth', descriptionKey: 'settingsShell.descriptions.auth', icon: Fingerprint, tone: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400', render: () => <AuthSettingsPage />, visible: 'notManager' },
            { value: 'api-keys', labelKey: 'settings.apiKeys.title', descriptionKey: 'settingsShell.descriptions.apiKeys', icon: KeyRound, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400', render: () => <ApiKeysSettingsPage />, visible: 'superAdmin' },
        ],
    },
    {
        labelKey: 'settingsShell.groups.communication',
        tabs: [
            { value: 'email', labelKey: 'settings.email', descriptionKey: 'settingsShell.descriptions.email', icon: Mail, tone: 'bg-rose-500/10 text-rose-700 dark:text-rose-400', render: () => <EmailSettingsPage />, visible: 'notManager' },
            { value: 'notifications', labelKey: 'settings.notifications.tab', descriptionKey: 'settingsShell.descriptions.notifications', icon: Bell, tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-400', render: () => <NotificationsSettingsPage />, visible: 'superAdmin' },
        ],
    },
    {
        labelKey: 'settingsShell.groups.data',
        tabs: [
            { value: 'export', labelKey: 'settings.export', descriptionKey: 'settingsShell.descriptions.export', icon: Download, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400', render: () => <ExportSettingsPage />, visible: 'notManager' },
            { value: 'backup', labelKey: 'settings.backup', descriptionKey: 'settingsShell.descriptions.backup', icon: Database, tone: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400', render: () => <BackupSettingsPage />, visible: 'notManager' },
            { value: 'updates', labelKey: 'settings.updates', descriptionKey: 'settingsShell.descriptions.updates', icon: Cloud, tone: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', render: () => <UpdatesPage />, visible: 'notManager' },
        ],
    },
];

/**
 * Settings Page.
 *
 * One menu of tabs grouped by theme (a column on wide screens, a scrolling bar on phones),
 * and for each tab the same header: icon, title and what it is for.
 */
export function SettingsPage() {
    const { t } = useTranslation();
    const role = useAuthStore((s) => s.role);
    const isSuperAdmin = role === 'SUPER_ADMIN';
    // A manager only gets Security (users and groups of their own sites): no other tab, so no settings API call either.
    const isManager = role === 'MANAGER';
    const [activeTab, setActiveTab] = useState(isManager ? 'security' : 'general');

    // The sticky tab header and the menu sit right under the page header: use its real height, not a guess.
    const rootRef = useRef<HTMLDivElement>(null);
    const headerRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const root = rootRef.current;
        const header = headerRef.current;
        if (!root || !header) return;
        const update = () => root.style.setProperty('--settings-header-h', `${header.offsetHeight}px`);
        update();
        if (typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(update);
        observer.observe(header);
        return () => observer.disconnect();
    }, []);

    const canSee = (tab: SettingsTab) =>
        tab.visible === 'all' || (tab.visible === 'notManager' && !isManager) || (tab.visible === 'superAdmin' && isSuperAdmin);
    const groups = GROUPS.map((group) => ({ ...group, tabs: group.tabs.filter(canSee) })).filter((group) => group.tabs.length > 0);
    const showMenu = groups.reduce((n, group) => n + group.tabs.length, 0) > 1;

    return (
        <div ref={rootRef} className="mx-auto w-full max-w-7xl pb-24">
            {/* Header: stays visible while the page scrolls. -mt-4 cancels the layout's p-4 so it starts where it pins; no gap below it, so the tab header and the menu also start exactly where they pin. */}
            <div ref={headerRef} className="sticky top-0 z-20 -mt-4 flex items-center gap-4 bg-background pb-4 pt-4 sm:pt-6">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Settings2 className="h-6 w-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">{t('settings.title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('settings.description')}</p>
                </div>
            </div>

            {/* Horizontal on purpose: a vertical Tabs would also turn the sub-tabs of each page vertical (Tailwind group variants). */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="gap-6 lg:items-start lg:data-[orientation=horizontal]:flex-row">
                <TabsList
                    aria-label={t('settings.title')}
                    className={
                        showMenu
                            ? 'h-auto group-data-[orientation=horizontal]/tabs:h-auto w-full shrink-0 flex-row items-stretch justify-start gap-1 overflow-x-auto rounded-xl border bg-card p-2 shadow-sm lg:sticky lg:top-[var(--settings-header-h,5.5rem)] lg:w-60 lg:flex-col lg:overflow-y-auto lg:overscroll-contain lg:max-h-[calc(100dvh-var(--settings-header-h,5.5rem)-5rem)] lg:[scrollbar-width:thin] lg:[scrollbar-color:transparent_transparent] lg:hover:[scrollbar-color:color-mix(in_srgb,var(--muted-foreground)_45%,transparent)_transparent]'
                            : 'sr-only'
                    }
                >
                    {groups.map((group) => (
                        <div key={group.labelKey} className="flex shrink-0 gap-1 lg:flex-col">
                            <p className="hidden px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground first:pt-1 lg:block">
                                {t(group.labelKey)}
                            </p>
                            {group.tabs.map(({ value, labelKey, icon: Icon, tone }) => (
                                <TabsTrigger
                                    key={value}
                                    value={value}
                                    className="group h-auto flex-none justify-start gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground data-[state=active]:bg-primary/5 data-[state=active]:text-foreground data-[state=active]:shadow-none lg:w-full"
                                >
                                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${tone} opacity-80 group-data-[state=active]:opacity-100`}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    {t(labelKey)}
                                </TabsTrigger>
                            ))}
                        </div>
                    ))}
                </TabsList>

                {groups.flatMap((group) => group.tabs).map(({ value, labelKey, descriptionKey, icon: Icon, tone, render }) => (
                    <TabsContent key={value} value={value} className="mt-0 min-w-0 flex-1 space-y-6">
                        {/* Pinned right under the page header (its measured height) so the tab name stays visible while its content scrolls. */}
                        <div className="sticky top-[var(--settings-header-h,5.5rem)] z-10 flex items-center gap-3 bg-background py-2">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                                <Icon className="h-5 w-5" />
                            </span>
                            <div className="min-w-0">
                                <h2 className="text-lg font-semibold leading-tight">{t(labelKey)}</h2>
                                <p className="text-sm text-muted-foreground">{t(descriptionKey)}</p>
                            </div>
                        </div>
                        {render()}
                    </TabsContent>
                ))}
            </Tabs>
        </div>
    );
}
