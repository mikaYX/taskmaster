import { useTranslation } from 'react-i18next';
import {
    BarChart3,
    CheckSquare,
    ChevronsUpDown,
    ClipboardCheck,
    ClipboardList,
    LayoutDashboard,
    LogOut,
    ScrollText,
    Settings2,
    ShieldCheck,
    User,
    type LucideIcon,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores';
import { useOwnProfile } from '@/hooks/use-users';
import { usePublicBranding } from '@/hooks/use-public-branding';

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { resolveAvatarSrc } from '@/lib/avatar';
import { TodoAttentionBadge } from '@/features/todos/todo-attention-badge';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface NavItem {
    titleKey: string;
    url: string;
    icon: LucideIcon;
}

// Same icons as the headers of the pages they open.
const mainNavItems: NavItem[] = [
    { titleKey: 'nav.taskBoard', url: '/', icon: LayoutDashboard },
    { titleKey: 'nav.correctiveActions', url: '/corrective-actions', icon: ShieldCheck },
    { titleKey: 'nav.todoList', url: '/todos', icon: CheckSquare },
];

const analyticsNavItems: NavItem[] = [
    { titleKey: 'nav.analytics', url: '/analytics', icon: BarChart3 },
];

const adminNavItems: NavItem[] = [
    { titleKey: 'nav.taskDefinitions', url: '/task-definitions', icon: ClipboardList },
    { titleKey: 'nav.settings', url: '/settings', icon: Settings2 },
    { titleKey: 'nav.auditLog', url: '/admin/audit', icon: ScrollText },
];

/** Active link: a tint of the primary colour and a small bar on the left. */
const NAV_BUTTON =
    'relative h-9 gap-3 rounded-lg px-3 text-[13px] font-medium text-sidebar-foreground/75 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ' +
    'data-[active=true]:bg-primary/10 data-[active=true]:font-semibold data-[active=true]:text-primary ' +
    'data-[active=true]:before:absolute data-[active=true]:before:inset-y-2 data-[active=true]:before:left-0 data-[active=true]:before:w-[3px] data-[active=true]:before:rounded-full data-[active=true]:before:bg-primary ' +
    'group-data-[collapsible=icon]:before:hidden';

const GROUP_LABEL = 'px-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/45';

/**
 * App Sidebar.
 *
 * Branding at the top, navigation grouped by use, and the signed-in person at the bottom.
 */
export function AppSidebar() {
    const { t } = useTranslation();
    const location = useLocation();
    const logout = useLogout();
    const role = useAuthStore(state => state.role);
    const isGuest = role === 'GUEST';
    const visibleAdminItems = adminNavItems.filter(item =>
        role === 'SUPER_ADMIN'
        || (item.url === '/task-definitions' && !!role && !isGuest)
        // Managers reach Settings, but only the users part of it (see SettingsPage).
        || (item.url === '/settings' && role === 'MANAGER'));
    const { data: currentUser } = useOwnProfile();

    // Branding settings
    const { getSetting, getSettingAsBool } = usePublicBranding();
    const appTitle = getSetting('app.title') || t('common.appName');
    const appSubtitle = getSetting('app.subtitle');
    const appLogo = getSetting('app.logoUrl');

    // Default to true if setting is missing (undefined)
    const showTitleStr = getSetting('app.showTitle');
    const showSubtitleStr = getSetting('app.showSubtitle');
    const showTitle = showTitleStr === undefined ? true : showTitleStr === 'true';
    const showSubtitle = showSubtitleStr === undefined ? true : showSubtitleStr === 'true';

    const displayName = currentUser?.fullname || currentUser?.username || t('common.user');
    const initials = displayName.substring(0, 2).toUpperCase();
    const avatarSrc = resolveAvatarSrc(currentUser?.avatarUrl);
    const roleLabel = role ? t(`profilePage.roleBadge.${role}`, { defaultValue: role }) : '';

    const handleLogout = () => {
        logout.mutate();
    };

    const showTodos = getSettingAsBool('addons.todolist.enabled');

    const isActive = (url: string) =>
        url === '/' ? location.pathname === '/' || location.pathname === '/tasks' : location.pathname === url || location.pathname.startsWith(`${url}/`);

    const renderItems = (items: NavItem[]) => (
        <SidebarMenu className="gap-0.5">
            {items.map((item) => (
                <SidebarMenuItem key={item.titleKey}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={t(item.titleKey)} className={NAV_BUTTON}>
                        <Link to={item.url}>
                            <item.icon className="h-4 w-4" />
                            <span>{t(item.titleKey)}</span>
                            {item.url === '/todos' && (
                                <TodoAttentionBadge className="ml-auto group-data-[collapsible=icon]:hidden" />
                            )}
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
            ))}
        </SidebarMenu>
    );

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="border-b border-sidebar-border px-3 py-4">
                <Link to="/" className="flex items-center gap-3 rounded-lg px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
                    {appLogo ? (
                        <img
                            src={appLogo}
                            alt={t('common.logo')}
                            className="h-10 w-10 shrink-0 rounded-xl object-contain group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
                        />
                    ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                            <ClipboardCheck className="h-5 w-5 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:w-4" />
                        </div>
                    )}
                    {(showTitle || (showSubtitle && appSubtitle)) && (
                        <div className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
                            {showTitle && (
                                <span className="truncate text-base font-bold tracking-tight text-sidebar-foreground">{appTitle}</span>
                            )}
                            {showSubtitle && appSubtitle && (
                                <span className="truncate text-[11px] text-sidebar-foreground/55">{appSubtitle}</span>
                            )}
                        </div>
                    )}
                </Link>
            </SidebarHeader>

            <SidebarContent className="gap-1 px-1 py-2">
                <SidebarGroup>
                    <SidebarGroupLabel className={GROUP_LABEL}>{t('nav.main')}</SidebarGroupLabel>
                    <SidebarGroupContent>
                        {renderItems(mainNavItems.filter(item => (item.url !== '/todos' || showTodos) && (!isGuest || item.url !== '/corrective-actions')))}
                    </SidebarGroupContent>
                </SidebarGroup>

                {!isGuest && (
                    <SidebarGroup>
                        <SidebarGroupLabel className={GROUP_LABEL}>{t('nav.analyticsGroup')}</SidebarGroupLabel>
                        <SidebarGroupContent>{renderItems(analyticsNavItems)}</SidebarGroupContent>
                    </SidebarGroup>
                )}

                {visibleAdminItems.length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel className={GROUP_LABEL}>{t('nav.admin')}</SidebarGroupLabel>
                        <SidebarGroupContent>{renderItems(visibleAdminItems)}</SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border p-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton
                                    size="lg"
                                    className="h-auto gap-3 rounded-xl px-2 py-2 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:p-0!"
                                    aria-label={t('nav.accountMenu')}
                                >
                                    <Avatar className="h-9 w-9 shrink-0 rounded-lg group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                                        <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />
                                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
                                        <span className="truncate text-sm font-semibold text-sidebar-foreground">{displayName}</span>
                                        {roleLabel && <span className="truncate text-[11px] text-sidebar-foreground/55">{roleLabel}</span>}
                                    </span>
                                    <ChevronsUpDown className="ml-auto h-4 w-4 shrink-0 text-sidebar-foreground/50" />
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl p-1.5">
                                <DropdownMenuLabel className="flex items-center gap-2.5 px-2 py-1.5 font-normal">
                                    <Avatar className="h-8 w-8 rounded-lg">
                                        <AvatarImage src={avatarSrc} alt="" className="object-cover" />
                                        <AvatarFallback className="rounded-lg bg-primary/10 text-xs font-semibold text-primary">{initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="flex min-w-0 flex-col leading-tight">
                                        <span className="truncate text-sm font-semibold">{displayName}</span>
                                        {currentUser?.email && <span className="truncate text-xs text-muted-foreground">{currentUser.email}</span>}
                                    </span>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem asChild className="gap-2.5 rounded-lg py-2">
                                    <Link to="/profile" className="cursor-pointer">
                                        <User className="h-4 w-4" />
                                        <span>{t('profile.myProfile')}</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleLogout} className="gap-2.5 rounded-lg py-2 text-destructive focus:bg-destructive/10 focus:text-destructive">
                                    <LogOut className="h-4 w-4 text-current" />
                                    <span>{t('auth.signOut')}</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    );
}
