import { Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';
import { AppHeader } from '@/components/app-header';
import { TodoFab } from '@/components/todos/todo-fab';
import { TodoOpenReminder } from '@/components/todos/todo-open-reminder';
import { PasskeyOnboardingModal } from '@/features/auth/components/passkey-onboarding-modal';
import { ChangePasswordDialog } from '@/features/profile/components/change-password-dialog';
import { useAuthStore } from '@/stores';
import { useState, useEffect } from 'react';
import { usePublicBranding } from '@/hooks/use-public-branding';
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
    const { isAuthenticated, passkeysEnabled, passkeyPolicy, hasPasskey, role, mustChangePassword } = useAuthStore();
    const { isTvMode, setIsTvMode } = useUIStore();
    const [isDismissed, setIsDismissed] = useState(() => !!sessionStorage.getItem('passkey_setup_dismissed'));

    useEffect(() => {
        if (role === 'GUEST' && !isTvMode) {
            setIsTvMode(true);
        }
    }, [role, isTvMode, setIsTvMode]);
    // A TV account never gets the navigation, whatever the UI mode says.
    const showChrome = role !== 'GUEST' && !isTvMode;
    const { getSettingAsBool } = usePublicBranding();
    const showTodos = getSettingAsBool('addons.todolist.enabled');

    const showForcedPasswordChange = Boolean(isAuthenticated && mustChangePassword);

    // The password change comes first; the passkey prompt shows once it is done.
    const showPasskeyModal = Boolean(
        isAuthenticated &&
        !mustChangePassword &&
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
        <SidebarProvider defaultOpen={!isTvMode} className="h-full overflow-hidden">
            {showChrome && <AppSidebar />}
            <SidebarInset className="overflow-hidden">
                {showChrome && <AppHeader titleKey={titleKey} subtitleKey={subtitleKey} showNotifications={showTodos} />}
                <main className="flex-1 overflow-hidden min-h-0">
                    {/* Radix lays its content out as a table, which lets wide content stretch the page past the screen. */}
                    <ScrollArea className="h-full w-full [&_[data-slot=scroll-area-viewport]>div]:!block">
                        <div className={cn(isTvMode ? "p-0" : "p-4")}>
                            <Outlet />
                        </div>
                    </ScrollArea>
                </main>
            </SidebarInset>

            {showTodos && <TodoFab />}
            {showTodos && showChrome && <TodoOpenReminder />}

            <ChangePasswordDialog
                forced
                open={showForcedPasswordChange}
                onOpenChange={() => { /* closed by the store once the password is changed */ }}
            />

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

