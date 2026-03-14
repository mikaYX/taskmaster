import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { TodoFab } from '@/components/todos/todo-fab';
import { PasskeyOnboardingModal } from '@/features/auth/components/passkey-onboarding-modal';
import { useAuthStore } from '@/stores';
import { useState, useEffect } from 'react';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { useUIStore } from '@/stores/ui-store';
import { ScrollArea } from '@/components/ui/scroll-area';

interface AppLayoutProps {
    titleKey?: string;
    subtitleKey?: string;
}

/**
 * App Layout.
 * 
 * Main layout with sidebar + header.
 * Based on Figma reference.
 */
export function AppLayout({ titleKey = 'nav.taskBoard', subtitleKey }: AppLayoutProps) {
    const { isAuthenticated, passkeysEnabled, passkeyPolicy, hasPasskey, role } = useAuthStore();
    const { isTvMode, setIsTvMode } = useUIStore();
    const [isDismissed, setIsDismissed] = useState(() => !!sessionStorage.getItem('passkey_setup_dismissed'));

    useEffect(() => {
        if (role === 'GUEST' && !isTvMode) {
            setIsTvMode(true);
        }
    }, [role, isTvMode, setIsTvMode]);
    const { getSettingAsBool } = useSettings();
    const showTodos = getSettingAsBool('addons.todolist.enabled');

    const showPasskeyModal = Boolean(
        isAuthenticated &&
        passkeysEnabled &&
        !hasPasskey &&
        passkeyPolicy !== 'disabled' &&
        !isDismissed
    );

    const handleOpenChange = (open: boolean) => {
        if (!open && passkeyPolicy === 'optional') {
            sessionStorage.setItem('passkey_setup_dismissed', 'true');
            setIsDismissed(true);
        }
    };

    return (
        <SidebarProvider defaultOpen={!isTvMode} open={!isTvMode} className="h-full overflow-hidden">
            {!isTvMode && <AppSidebar />}
            <SidebarInset className="overflow-hidden">
                {!isTvMode && <AppHeader titleKey={titleKey} subtitleKey={subtitleKey} />}
                <main className="flex-1 overflow-hidden min-h-0">
                    <ScrollArea className="h-full w-full">
                        <div className={cn(isTvMode ? "p-0" : "p-4")}>
                            <Outlet />
                        </div>
                    </ScrollArea>
                </main>
            </SidebarInset>

            {showTodos && <TodoFab />}

            {passkeyPolicy !== 'disabled' && (
                <PasskeyOnboardingModal
                    open={showPasskeyModal}
                    onOpenChange={handleOpenChange}
                    policy={passkeyPolicy}
                />
            )}
        </SidebarProvider>
    );
}

