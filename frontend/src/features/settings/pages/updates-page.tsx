import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowUpCircle,
  ExternalLink,
  Info,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useVersionStatus } from '@/hooks/use-version-status';
import { useAuthStore } from '@/stores/auth-store';

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
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(data.checkedAt))
    : t('settings.updatesUnavailable');

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="gap-4 md:flex md:flex-row md:items-start md:justify-between">
          <div className="space-y-1.5">
            <CardTitle>{t('settings.updates')}</CardTitle>
            <CardDescription>{t('settings.updatesDescription')}</CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            className="gap-2"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            )}
            {t('settings.updatesRefresh')}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
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

          {data?.updateAvailable && (
            <Alert>
              <ArrowUpCircle className="h-4 w-4" />
              <AlertTitle>
                {t('version.updateAvailable', {
                  latest: data.latestVersion,
                  current: data.currentVersion,
                })}
              </AlertTitle>
              {data.releaseUrl && (
                <AlertDescription>
                  <a
                    href={data.releaseUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {t('version.viewRelease')}
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </AlertDescription>
              )}
            </Alert>
          )}

          {isLoading && !data ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : data ? (
            <div className="grid gap-4 md:grid-cols-2">
              <StatusCard
                label={t('settings.updatesStatus')}
                value={
                  data.updateAvailable
                    ? t('settings.updatesAvailable')
                    : t('settings.updatesUpToDate')
                }
                badge={
                  <Badge variant={data.updateAvailable ? 'default' : 'secondary'}>
                    {data.updateAvailable
                      ? t('settings.updatesAvailable')
                      : t('settings.updatesUpToDate')}
                  </Badge>
                }
              />
              <StatusCard
                label={t('settings.updatesSource')}
                value={data.repo}
                badge={
                  <Badge
                    variant={
                      data.sourceStatus === 'ok' ? 'secondary' : 'destructive'
                    }
                  >
                    {data.sourceStatus === 'ok'
                      ? t('settings.updatesOk')
                      : t('settings.updatesDegraded')}
                  </Badge>
                }
              />
              <StatusCard
                label={t('settings.updatesCurrent')}
                value={data.currentVersion}
              />
              <StatusCard
                label={t('settings.updatesLatest')}
                value={data.latestVersion ?? t('settings.updatesUnavailable')}
              />
              <StatusCard
                label={t('settings.updatesLastChecked')}
                value={checkedAt}
              />
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              {t('settings.updatesNoData')}
            </div>
          )}

          <Separator />

          <p className="text-sm text-muted-foreground">
            {t('settings.updatesSourceHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatusCard({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        {badge}
      </div>
      <p className="break-all text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}