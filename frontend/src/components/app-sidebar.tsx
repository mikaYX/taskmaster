import { useTranslation } from 'react-i18next';
import {
    ClipboardCheck,
    ListTodo,
    Settings,
    LogOut,
    User,
    ShieldAlert,
    CheckSquare,
    BarChart3,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores';
import { useUsers } from '@/hooks/use-users';
import { useSettings } from '@/features/settings/hooks/use-settings';

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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const mainNavItems = [
    { titleKey: 'nav.taskBoard', url: '/', icon: ClipboardCheck },
    { titleKey: 'nav.todoList', url: '/todos', icon: CheckSquare },
];

const analyticsNavItems = [
    { titleKey: 'nav.analytics', url: '/analytics', icon: BarChart3 },
];

const adminNavItems = [
    { titleKey: 'nav.taskDefinitions', url: '/task-definitions', icon: ListTodo },
    { titleKey: 'nav.settings', url: '/settings', icon: Settings },
    { titleKey: 'Audit Log', url: '/admin/audit', icon: ShieldAlert },
];

/**
 * App Sidebar.
 * 
 * shadcn/ui Sidebar with navigation.
 * Based on Figma reference: dark theme, collapsible.
 */
export function AppSidebar() {
    const { t } = useTranslation();
    const location = useLocation();
    const logout = useLogout();
    const userId = useAuthStore((state) => state.userId);
    const isGuest = useAuthStore((state) => state.role === 'GUEST');
    const { data: users } = useUsers();

    // Branding settings
    const { getSetting, getSettingAsBool } = useSettings();
    const appTitle = getSetting('app.title') || t('common.appName');
    const appSubtitle = getSetting('app.subtitle');
    const appLogo = getSetting('app.logoUrl');

    // Default to true if setting is missing (undefined)
    const showTitleStr = getSetting('app.showTitle');
    const showSubtitleStr = getSetting('app.showSubtitle');
    const showTitle = showTitleStr === undefined ? true : showTitleStr === 'true';
    const showSubtitle = showSubtitleStr === undefined ? true : showSubtitleStr === 'true';

    const currentUser = users?.find(u => u.id === userId);
    const displayName = currentUser?.fullname || currentUser?.username || 'User';
    const initials = displayName.substring(0, 2).toUpperCase();

    const handleLogout = () => {
        logout.mutate();
    };

    const showTodos = getSettingAsBool('addons.todolist.enabled');

    return (
        <Sidebar>
            <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
                <div className="flex flex-col items-center gap-4 text-center py-2">
                    {appLogo ? (
                        <img
                            src={appLogo}
                            alt="Logo"
                            className="h-12 w-auto max-w-full object-contain rounded-md transition-all group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8"
                        />
                    ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
                            <ClipboardCheck className="h-6 w-6 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:w-4" />
                        </div>
                    )}
                    <div className="flex flex-col items-center leading-none group-data-[collapsible=icon]:hidden">
                        {showTitle && (
                            <span className="font-bold text-xl tracking-tight text-foreground/90">{appTitle}</span>
                        )}
                        {showSubtitle && appSubtitle && (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80 mt-1">{appSubtitle}</span>
                        )}
                    </div>
                </div>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupLabel>{t('nav.main')}</SidebarGroupLabel>
                    <SidebarGroupContent>
                        <SidebarMenu>
                            {mainNavItems
                                .filter(item => item.url !== '/todos' || showTodos)
                                .map((item) => (
                                    <SidebarMenuItem key={item.titleKey}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname === item.url}
                                        >
                                            <Link to={item.url}>
                                                <item.icon className="h-4 w-4" />
                                                <span>{t(item.titleKey)}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>

                {!isGuest && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('nav.analyticsGroup')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {analyticsNavItems.map((item) => (
                                    <SidebarMenuItem key={item.titleKey}>
                                        <SidebarMenuButton
                                            asChild
                                            isActive={location.pathname.startsWith(item.url)}
                                        >
                                            <Link to={item.url}>
                                                <item.icon className="h-4 w-4" />
                                                <span>{t(item.titleKey)}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}

                {adminNavItems.filter(item => !(isGuest && (item.titleKey === 'nav.settings' || item.titleKey === 'Audit Log' || item.titleKey === 'nav.taskDefinitions'))).length > 0 && (
                    <SidebarGroup>
                        <SidebarGroupLabel>{t('nav.admin')}</SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {adminNavItems
                                    .filter(item => !(isGuest && (item.titleKey === 'nav.settings' || item.titleKey === 'Audit Log' || item.titleKey === 'nav.taskDefinitions')))
                                    .map((item) => (
                                        <SidebarMenuItem key={item.titleKey}>
                                            <SidebarMenuButton
                                                asChild
                                                isActive={location.pathname === item.url}
                                            // TODO: Check role for admin items
                                            >
                                                <Link to={item.url}>
                                                    <item.icon className="h-4 w-4" />
                                                    <span>{t(item.titleKey)}</span>
                                                </Link>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                )}
            </SidebarContent>

            <SidebarFooter className="border-t border-sidebar-border">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <SidebarMenuButton className="w-full">
                                    <Avatar className="h-6 w-6">
                                        <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                                    </Avatar>
                                    <span className="flex-1 text-left">{displayName}</span>
                                </SidebarMenuButton>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="top" className="w-56">
                                <DropdownMenuItem asChild>
                                    <Link to="/profile" className="cursor-pointer">
                                        <User className="mr-2 h-4 w-4" />
                                        <span>{t('profile.myProfile')}</span>
                                    </Link>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleLogout}>
                                    <LogOut className="mr-2 h-4 w-4" />
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
