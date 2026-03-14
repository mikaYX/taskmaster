import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@/components/theme-provider';
import { QueryProvider } from '@/lib/query-provider';
import { SessionInitializer } from '@/components/session-initializer';
import { AuthGuard, GuestGuard, NoGuestGuard } from '@/components/auth-guard';
import { SetupGuard } from '@/components/setup-guard';
import { AppLayout } from '@/components/app-layout';
import { LoginPage } from '@/features/auth';
import { SetupWizard } from '@/features/setup';
import { ErrorBoundary } from '@/components/error-boundary';
import { OfflineBanner } from '@/components/offline-banner';
import { VersionUpdateBanner } from '@/components/version-update-banner';
import {
    TaskBoardSkeleton,
    TablePageSkeleton,
    AnalyticsSkeleton,
    SettingsSkeleton,
    ProfileSkeleton,
    PageSkeleton,
} from '@/components/ui/page-skeleton';
import { lazy, Suspense } from 'react';

const TaskBoardPage = lazy(() => import('@/features/task-board').then(m => ({ default: m.TaskBoardPage })));
const TodosPage = lazy(() => import('@/features/todos/todos-page').then(m => ({ default: m.TodosPage })));
const AnalyticsPage = lazy(() => import('@/features/analytics').then(m => ({ default: m.AnalyticsPage })));

const TasksPage = lazy(() => import('@/features/tasks').then(m => ({ default: m.TasksPage })));
const WizardPage = lazy(() => import('@/features/tasks/wizard/wizard-page'));
const TaskDetailsPage = lazy(() => import('@/features/tasks/task-details-page').then(m => ({ default: m.TaskDetailsPage })));
const EditTaskPage = lazy(() => import('@/features/tasks/edit-task-page').then(m => ({ default: m.EditTaskPage })));
const TasksArchivePage = lazy(() => import('@/features/tasks/pages/tasks-archive-page').then(m => ({ default: m.TasksArchivePage })));
const SettingsPage = lazy(() => import('@/features/settings').then(m => ({ default: m.SettingsPage })));
const ExportSettingsPage = lazy(() => import('@/features/settings/pages/export-settings-page').then(m => ({ default: m.ExportSettingsPage })));
const BackupSettingsPage = lazy(() => import('@/features/settings/pages/backup-settings-page').then(m => ({ default: m.BackupSettingsPage })));
const ProfilePage = lazy(() => import('@/features/profile').then(m => ({ default: m.ProfilePage })));
const AdminLayout = lazy(() => import('@/features/admin/layouts/admin-layout').then(m => ({ default: m.AdminLayout })));
const AuditLogPage = lazy(() => import('@/features/admin/pages/audit-log-page').then(m => ({ default: m.AuditLogPage })));

import { DynamicBranding } from '@/components/dynamic-branding';
import { useSystemHealth } from '@/hooks/use-system-health';
import { SystemUnavailablePage } from '@/components/system-unavailable-page';
import { Loader2 } from 'lucide-react';
import { Toaster } from '@/components/ui/sonner';

/**
 * App Component.
 *
 * STRICTLY ROUTING ONLY (per design.md rules).
 * Providers: Theme → Query → Session → Router
 */

function App() {
  const { status, checkHealth, isLoading } = useSystemHealth();

  // Show loading spinner while checking health to prevent cascading errors
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show unavailable page if system is down
  if (status === 'unavailable') {
    return (
      <ThemeProvider defaultTheme="system">
        <SystemUnavailablePage onRetry={checkHealth} isRetrying={isLoading} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider defaultTheme="system">
      <QueryProvider>
        <BrowserRouter>
          <SessionInitializer>
            <DynamicBranding />
            <OfflineBanner />
            <VersionUpdateBanner />
            <Toaster richColors position="top-right" />
            <Routes>
              {/* Setup wizard (first-time) */}
              <Route path="/setup" element={<SetupWizard />} />

              {/* Auth routes (guest only) */}
              <Route
                path="/login"
                element={
                  <SetupGuard>
                    <GuestGuard>
                      <LoginPage />
                    </GuestGuard>
                  </SetupGuard>
                }
              />

              {/* App routes (authenticated + setup complete) */}
              <Route
                element={
                  <AuthGuard>
                    <SetupGuard>
                      <AppLayout />
                    </SetupGuard>
                  </AuthGuard>
                }
              >
                {/* Task Board = Main operational screen (LEGACY_AUDIT.md) */}
                <Route path="/" element={<ErrorBoundary variant="section" context="Tableau de bord"><Suspense fallback={<TaskBoardSkeleton />}><TaskBoardPage /></Suspense></ErrorBoundary>} />
                <Route path="/tasks" element={<ErrorBoundary variant="section" context="Tableau de bord"><Suspense fallback={<TaskBoardSkeleton />}><TaskBoardPage /></Suspense></ErrorBoundary>} />
                <Route path="/todos" element={<ErrorBoundary variant="section" context="Todos"><Suspense fallback={<TablePageSkeleton rows={4} />}><TodosPage /></Suspense></ErrorBoundary>} />

                <Route path="/analytics" element={<NoGuestGuard><ErrorBoundary variant="section" context="Analytiques"><Suspense fallback={<AnalyticsSkeleton />}><AnalyticsPage /></Suspense></ErrorBoundary></NoGuestGuard>} />

                {/* Task definitions — routes regroupées sous /task-definitions */}
                <Route path="/task-definitions" element={<NoGuestGuard><ErrorBoundary variant="section" context="Tâches"><Suspense fallback={<TablePageSkeleton />}><TasksPage /></Suspense></ErrorBoundary></NoGuestGuard>} />
                <Route path="/task-definitions/new" element={<NoGuestGuard><ErrorBoundary variant="section" context="Nouvelle tâche"><Suspense fallback={<PageSkeleton />}><WizardPage /></Suspense></ErrorBoundary></NoGuestGuard>} />
                <Route path="/task-definitions/archive" element={<NoGuestGuard><ErrorBoundary variant="section" context="Archives"><Suspense fallback={<TablePageSkeleton />}><TasksArchivePage /></Suspense></ErrorBoundary></NoGuestGuard>} />
                <Route path="/task-definitions/:id" element={<NoGuestGuard><ErrorBoundary variant="section" context="Détail tâche"><Suspense fallback={<PageSkeleton />}><TaskDetailsPage /></Suspense></ErrorBoundary></NoGuestGuard>} />
                <Route path="/task-definitions/:id/edit" element={<NoGuestGuard><ErrorBoundary variant="section" context="Édition tâche"><Suspense fallback={<PageSkeleton />}><EditTaskPage /></Suspense></ErrorBoundary></NoGuestGuard>} />

                <Route path="/exports" element={<NoGuestGuard><ErrorBoundary variant="section" context="Exports"><Suspense fallback={<SettingsSkeleton />}><ExportSettingsPage /></Suspense></ErrorBoundary></NoGuestGuard>} />
                <Route path="/backups" element={<NoGuestGuard><ErrorBoundary variant="section" context="Sauvegardes"><Suspense fallback={<SettingsSkeleton />}><BackupSettingsPage /></Suspense></ErrorBoundary></NoGuestGuard>} />

                {/* Settings with tab navigation */}
                <Route path="/settings" element={<NoGuestGuard><ErrorBoundary variant="section" context="Paramètres"><Suspense fallback={<SettingsSkeleton />}><SettingsPage /></Suspense></ErrorBoundary></NoGuestGuard>} />

                {/* User Profile */}
                <Route path="/profile" element={<ErrorBoundary variant="section" context="Profil"><Suspense fallback={<ProfileSkeleton />}><ProfilePage /></Suspense></ErrorBoundary>} />

                {/* Admin Routes */}
                <Route path="/admin" element={<NoGuestGuard><ErrorBoundary variant="section" context="Administration"><Suspense fallback={<TablePageSkeleton />}><AdminLayout /></Suspense></ErrorBoundary></NoGuestGuard>}>
                  <Route index element={<Navigate to="/admin/audit" replace />} />
                  <Route path="audit" element={<Suspense fallback={<TablePageSkeleton />}><AuditLogPage /></Suspense>} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </SessionInitializer>
        </BrowserRouter>
      </QueryProvider>
    </ThemeProvider>
  );
}

export default App;
