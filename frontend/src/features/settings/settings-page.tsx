import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollAreaHorizontal } from '@/components/ui/scroll-area';
import {
    Breadcrumb,
    BreadcrumbList,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbSeparator,
    BreadcrumbPage,
} from '@/components/ui/breadcrumb';
import { ChevronRight } from 'lucide-react';

import { GeneralSettingsPage } from './pages/general-settings-page';
import { SecuritySettingsPage } from './pages/security-settings-page';
import { AuthSettingsPage } from './pages/auth-settings-page';
import { EmailSettingsPage } from './pages/email-settings-page';
import { ExportSettingsPage } from './pages/export-settings-page';
import { BackupSettingsPage } from './pages/backup-settings-page';
import { SchedulerSettingsPage } from './pages/scheduler-settings-page';
import { ApiKeysSettingsPage } from './pages/api-keys-settings-page';
import { SitesSettingsPage } from './pages/sites-settings-page';
import { NotificationsSettingsPage } from './pages/notifications-settings-page';
import { FeedbackPage } from './pages/feedback-page';
import { useAuthStore } from '@/stores/auth-store';

/**
 * Settings Page.
 * 
 * Unified settings interface with horizontal tab navigation.
 * Main AppSidebar remains visible (no dedicated settings sidebar).
 */
export function SettingsPage() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('general');
    const role = useAuthStore((s) => s.role);
    const isSuperAdmin = role === 'SUPER_ADMIN';

    return (
        <div className="container mx-auto py-6 space-y-6 max-w-6xl">
            {/* Breadcrumb */}
            <Breadcrumb>
                <BreadcrumbList>
                    <BreadcrumbItem>
                        <BreadcrumbLink asChild>
                            <Link to="/">{t('nav.taskBoard')}</Link>
                        </BreadcrumbLink>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator>
                        <ChevronRight className="h-4 w-4" />
                    </BreadcrumbSeparator>
                    <BreadcrumbItem>
                        <BreadcrumbPage>{t('settings.title')}</BreadcrumbPage>
                    </BreadcrumbItem>
                </BreadcrumbList>
            </Breadcrumb>

            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
                <p className="text-muted-foreground mt-2">
                    {t('settings.description')}
                </p>
            </div>

            {/* Tab Navigation — ScrollArea horizontal shadcn en fenêtre réduite */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <ScrollAreaHorizontal className="w-full border-b border-border">
                    <TabsList variant="line" className="inline-flex w-max min-w-full justify-start h-auto pb-2 pt-0 border-0 bg-transparent">
                        <TabsTrigger value="general">{t('settings.general')}</TabsTrigger>
                        <TabsTrigger value="security">{t('settings.security')}</TabsTrigger>
                        <TabsTrigger value="auth">{t('settings.auth')}</TabsTrigger>
                        <TabsTrigger value="email">{t('settings.email')}</TabsTrigger>
                        <TabsTrigger value="export">{t('settings.export')}</TabsTrigger>
                        <TabsTrigger value="backup">{t('settings.backup')}</TabsTrigger>
                        <TabsTrigger value="scheduler">{t('settings.scheduler')}</TabsTrigger>
                        {isSuperAdmin && (
                            <>
                                <TabsTrigger value="sites">{t('settings.sites')}</TabsTrigger>
                                <TabsTrigger value="notifications">{t('settings.notifications.tab')}</TabsTrigger>
                                <TabsTrigger value="api-keys">{t('settings.apiKeys.title')}</TabsTrigger>
                            </>
                        )}
                        <TabsTrigger value="feedback">{t('settings.feedback')}</TabsTrigger>
                    </TabsList>
                </ScrollAreaHorizontal>

                <TabsContent value="general" className="mt-6">
                    <div className="space-y-6">
                        <GeneralSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="security" className="mt-6">
                    <div className="space-y-6">
                        <SecuritySettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="auth" className="mt-6">
                    <div className="space-y-6">
                        <AuthSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="email" className="mt-6">
                    <div className="space-y-6">
                        <EmailSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="export" className="mt-6">
                    <div className="space-y-6">
                        <ExportSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="backup" className="mt-6">
                    <div className="space-y-6">
                        <BackupSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="scheduler" className="mt-6">
                    <div className="space-y-6">
                        <SchedulerSettingsPage />
                    </div>
                </TabsContent>

                <TabsContent value="api-keys" className="mt-6">
                    <div className="space-y-6">
                        <ApiKeysSettingsPage />
                    </div>
                </TabsContent>

                {isSuperAdmin && (
                    <>
                        <TabsContent value="sites" className="mt-6">
                            <div className="space-y-6">
                                <SitesSettingsPage />
                            </div>
                        </TabsContent>
                        <TabsContent value="notifications" className="mt-6">
                            <div className="space-y-6">
                                <NotificationsSettingsPage />
                            </div>
                        </TabsContent>
                    </>
                )}

                <TabsContent value="feedback" className="mt-6">
                    <div className="space-y-6">
                        <FeedbackPage />
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
