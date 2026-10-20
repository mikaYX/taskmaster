import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsSection } from '../components/settings-section';
import { useSettings } from '../hooks/use-settings';
import { schedulerApi } from '@/api/scheduler';
import { settingsApi } from '@/api/settings';

import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Loader2, Power, Clock, Info, Play, Pause, Globe, ListChecks } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { getDateLocale } from '@/lib/date-locale';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SchedulerSettingsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { settings, getSetting, isLoading } = useSettings();
    // `enabled` is derived from `settings` during render (not synced via effect);
    // `enabledOverride` holds the optimistic value between a toggle click and the
    // settings query re-fetch, and is only ever reset back on failure.
    const [enabledOverride, setEnabledOverride] = useState<boolean | null>(null);
    const enabled = enabledOverride ?? (settings.length > 0 ? Boolean(getSetting('scheduler.enabled')) : false);
    const [isSyncingScheduler, setIsSyncingScheduler] = useState(false);
    const [runningJobName, setRunningJobName] = useState<string | null>(null);
    const [togglingJobName, setTogglingJobName] = useState<string | null>(null);

    // Fetch Jobs Status
    const { data: jobs, isLoading: isLoadingJobs } = useQuery({
        queryKey: ['system-jobs'],
        queryFn: schedulerApi.getJobs,
        refetchInterval: 30000,
    });

    const handleToggle = async (checked: boolean) => {
        setEnabledOverride(checked);
        setIsSyncingScheduler(true);
        try {
            await settingsApi.set({ key: 'scheduler.enabled', value: checked });
            // Force backend to sync state immediately
            await schedulerApi.sync();

            // Invalidate both settings and jobs to ensure consistency
            queryClient.invalidateQueries({ queryKey: ['settings'] });
            queryClient.invalidateQueries({ queryKey: ['system-jobs'] });

            if (!checked) {
                toast.warning(t('scheduler.disabledWarning'));
            } else {
                toast.success(t('scheduler.enabledSuccess'));
            }
        } catch {
            setEnabledOverride(!checked);
            toast.error(t('schedulerSettings.updateError'));
        } finally {
            setIsSyncingScheduler(false);
        }
    };

    const handleTriggerJob = async (jobName: string) => {
        setRunningJobName(jobName);
        try {
            const res = await schedulerApi.triggerJob(jobName);
            if (res.success) {
                toast.success(res.message);
            } else {
                toast.error(res.message);
            }
            queryClient.invalidateQueries({ queryKey: ['system-jobs'] });
        } catch {
            toast.error(t('schedulerSettings.triggerError', { jobName }));
        } finally {
            setRunningJobName(null);
        }
    };

    const handleToggleJob = async (jobName: string) => {
        setTogglingJobName(jobName);
        // Optimistic update
        queryClient.setQueryData(['system-jobs'], (old: typeof jobs) =>
            old?.map((j) => j.name === jobName ? { ...j, enabled: !j.enabled } : j)
        );
        try {
            const res = await schedulerApi.toggleJob(jobName);
            if (res.success) {
                toast.success(res.message);
            } else {
                toast.error(res.message);
            }
            queryClient.invalidateQueries({ queryKey: ['system-jobs'] });
        } catch {
            // Revert on error
            queryClient.invalidateQueries({ queryKey: ['system-jobs'] });
            toast.error(t('schedulerSettings.toggleError', { jobName }));
        } finally {
            setTogglingJobName(null);
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return (
        <div className="space-y-6">

            {/* MASTER TOGGLE */}
            <SettingsSection
                title={t('scheduler.masterSwitch')}
                description={t('scheduler.masterDesc')}
                icon={Power}
                className={!enabled ? "border-destructive/50 bg-destructive/5" : ""}
                action={
                    <div className="flex items-center gap-2">
                        <span className={enabled ? "text-sm font-medium text-emerald-600 dark:text-emerald-400" : "text-sm font-medium text-destructive"}>
                            {enabled ? t('schedulerSettings.active') : t('schedulerSettings.suspended')}
                        </span>
                        <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isSyncingScheduler} aria-label={t('scheduler.masterSwitch')} />
                    </div>
                }
            />


            {!enabled && (
                <Alert variant="destructive">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertTitle>{t('schedulerSettings.systemPausedTitle')}</AlertTitle>
                    <AlertDescription>
                        {t('schedulerSettings.systemPausedDescription')}
                    </AlertDescription>
                </Alert>
            )}

            {/* TIMEZONE */}
            <SettingsSection title={t('schedulerSettings.systemTimezoneTitle')} description={t('schedulerSettings.systemTimezoneDescription')} icon={Globe}>
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{t('schedulerSettings.detectedTimezone', { timezone })}</span>
                </div>
            </SettingsSection>

            {/* JOB STATUS (READ ONLY) */}
            <SettingsSection title={t('schedulerSettings.jobStatusTitle')} description={t('schedulerSettings.jobStatusDescription')} icon={ListChecks}>
                {isLoadingJobs ? (
                    <div className="space-y-2">
                        <Skeleton className="h-16 rounded-xl" />
                        <Skeleton className="h-16 rounded-xl" />
                    </div>
                ) : !jobs || jobs.length === 0 ? (
                    <p className="rounded-xl border border-dashed py-8 text-center text-sm text-muted-foreground">{t('schedulerSettings.noJobs')}</p>
                ) : (
                    <ul className="divide-y rounded-xl border">
                        {jobs.map((job) => {
                            const active = enabled && job.enabled;
                            return (
                                <li key={job.name} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !enabled && "opacity-60")}>
                                    <div className="flex min-w-0 flex-1 items-start gap-3">
                                        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-sky-500/10 text-sky-700 dark:text-sky-400" : "bg-muted text-muted-foreground")}>
                                            <Clock className="h-4 w-4" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-mono text-sm font-semibold">{job.name}</p>
                                            {job.description && <p className="text-xs text-muted-foreground">{job.description}</p>}
                                            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                                                <code className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground" title={t('schedulerSettings.scheduleCron')}>{job.cron}</code>
                                                <span className="text-muted-foreground">
                                                    {t('scheduler.nextRun')} : {active && job.nextRun ? new Date(job.nextRun).toLocaleString(getDateLocale().code, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 sm:shrink-0">
                                        <span className={cn(
                                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
                                            active ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                                        )}>
                                            <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-muted-foreground/60")} />
                                            {active ? t('schedulerSettings.active') : t('schedulerSettings.disabled')}
                                        </span>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="h-8 w-8"
                                            aria-label={job.enabled ? t('schedulerSettings.pauseJob') : t('schedulerSettings.enableJob')}
                                            title={job.enabled ? t('schedulerSettings.pauseJob') : t('schedulerSettings.enableJob')}
                                            onClick={() => handleToggleJob(job.name)}
                                            disabled={!enabled || togglingJobName === job.name}
                                        >
                                            {togglingJobName === job.name ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : job.enabled ? (
                                                <Pause className="h-3.5 w-3.5" />
                                            ) : (
                                                <Power className="h-3.5 w-3.5" />
                                            )}
                                        </Button>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            size="sm"
                                            className="h-8 gap-1.5"
                                            onClick={() => handleTriggerJob(job.name)}
                                            disabled={!enabled || runningJobName === job.name}
                                        >
                                            {runningJobName === job.name ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            ) : (
                                                <Play className="h-3.5 w-3.5" />
                                            )}
                                            {t('schedulerSettings.runNow')}
                                        </Button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SettingsSection>
        </div>
    );
}
