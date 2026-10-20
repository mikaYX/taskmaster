import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowUpCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cloud,
  Package,
  HelpCircle,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useVersionStatus } from '@/hooks/use-version-status';
import { useAuthStore } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { getDateLocale } from '@/lib/date-locale';
import { SettingsSection } from '../components/settings-section';

export function UpdatesPage() {
  const { t } = useTranslation();
  const role = useAuthStore((state) => state.role);
  const isPrivileged = role === 'SUPER_ADMIN' || role === 'MANAGER';
  const {
    data,
    isLoading,
    isFetching,
    error,
    backendUpgraded,
    refresh,
    isRefreshing,
  } = useVersionStatus(isPrivileged);

  const checkedAt = data?.checkedAt
    ? new Intl.DateTimeFormat(getDateLocale().code, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(data.checkedAt))
    : t('settings.updatesUnavailable');

  // Without a known latest version (offline mode, unreachable source) the
  // install cannot be claimed up to date.
  const updateStatusLabel = data?.updateAvailable
    ? t('settings.updatesAvailable')
    : data?.latestVersion
      ? t('settings.updatesUpToDate')
      : t('settings.updatesUnknown');

  const handleRefresh = async () => {
    try {
      await refresh();
      toast.success(t('settings.updatesRefreshSuccess'));
    } catch {
      toast.error(t('settings.updatesRefreshError'));
    }
  };

  if (!isPrivileged) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('settings.updates')}</CardTitle>
          <CardDescription>{t('settings.updatesDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>{t('settings.updatesAccessTitle')}</AlertTitle>
            <AlertDescription>
              {t('settings.updatesAccessDescription')}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const state: 'available' | 'upToDate' | 'unknown' = data?.updateAvailable ? 'available' : data?.latestVersion ? 'upToDate' : 'unknown';
  const STATE_TONE = {
    available: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    upToDate: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    unknown: 'bg-muted text-muted-foreground',
  };
  const StateIcon = state === 'available' ? ArrowUpCircle : state === 'upToDate' ? CheckCircle2 : HelpCircle;

  return (
    <div className="space-y-6">
      <SettingsSection
        title={t('settings.updates')}
        description={t('settings.updatesDescription')}
        icon={Cloud}
        action={
          <Button type="button" variant="outline" className="gap-2" onClick={handleRefresh} disabled={isRefreshing}>
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />}
            {t('settings.updatesRefresh')}
          </Button>
        }
        footer={<p className="mr-auto text-xs text-muted-foreground">{t('settings.updatesSourceHint')}</p>}
      >
        {backendUpgraded && (
          <Alert>
            <RefreshCw className="h-4 w-4" />
            <AlertTitle>{t('version.reloadRequired')}</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{t('settings.updatesReloadDescription')}</span>
              <Button type="button" size="sm" onClick={() => window.location.reload()}>
                {t('version.reload')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {(error || data?.sourceStatus === 'degraded' || data?.error) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{t('settings.updatesErrorTitle')}</AlertTitle>
            <AlertDescription>
              {data?.error || error?.message || t('settings.updatesErrorDescription')}
            </AlertDescription>
          </Alert>
        )}

        {isLoading && !data ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : data ? (
          <>
            {/* Installed → latest */}
            <div className={cn('flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center', state === 'available' && 'border-amber-500/40 bg-amber-500/5')}>
              <span className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl', STATE_TONE[state])}>
                <StateIcon className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', STATE_TONE[state])}>{updateStatusLabel}</span>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-2xl font-bold tabular-nums">{data.currentVersion}</span>
                  {data.latestVersion && data.latestVersion !== data.currentVersion && (
                    <>
                      <ArrowRight className="h-4 w-4 self-center text-muted-foreground" />
                      <span className="text-2xl font-bold tabular-nums text-amber-700 dark:text-amber-400">{data.latestVersion}</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('settings.updatesCurrent')} {data.latestVersion && <>· {t('settings.updatesLatest')} : {data.latestVersion}</>}
                </p>
              </div>
              {data.updateAvailable && data.releaseUrl && (
                <Button asChild className="gap-2 sm:shrink-0">
                  <a href={data.releaseUrl} target="_blank" rel="noopener noreferrer">
                    {t('version.viewRelease')}
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Package className="h-3.5 w-3.5" />{t('settings.updatesSource')}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', data.sourceStatus === 'ok' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400')}>
                    {data.sourceStatus === 'ok' ? t('settings.updatesOk') : t('settings.updatesDegraded')}
                  </span>
                </div>
                <p className="break-all text-sm font-semibold">{data.repo || '—'}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Clock className="h-3.5 w-3.5" />{t('settings.updatesLastChecked')}</span>
                <p className="text-sm font-semibold">{checkedAt}</p>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
            {t('settings.updatesNoData')}
          </div>
        )}
      </SettingsSection>
    </div>
  );
}
