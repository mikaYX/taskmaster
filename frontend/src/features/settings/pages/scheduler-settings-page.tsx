import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsSection } from '../components/settings-section';
import { useSettings } from '../hooks/use-settings';
import { schedulerApi } from '@/api/scheduler';
import { settingsApi } from '@/api/settings';

import { toast } from 'sonner';

import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Power, Clock, Info, Play, Pause } from 'lucide-react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function SchedulerSettingsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { settings, getSetting, isLoading } = useSettings();
    const [enabled, setEnabled] = useState(false);
    const [isSyncingScheduler, setIsSyncingScheduler] = useState(false);
    const [runningJobName, setRunningJobName] = useState<string | null>(null);
    const [togglingJobName, setTogglingJobName] = useState<string | null>(null);

    // Fetch Jobs Status
    const { data: jobs, isLoading: isLoadingJobs } = useQuery({
        queryKey: ['system-jobs'],
        queryFn: schedulerApi.getJobs,
        refetchInterval: 30000,
    });

    useEffect(() => {
        if (settings.length > 0) {
            const val = getSetting('scheduler.enabled');
            if (val !== undefined && val !== null) {
                setEnabled(Boolean(val));
            }
        }
    }, [settings, getSetting]);

    const handleToggle = async (checked: boolean) => {
        setEnabled(checked);
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
            setEnabled(!checked);
            toast.error('Failed to update scheduler state');
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
            toast.error(`Failed to trigger ${jobName}`);
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
            toast.error(`Failed to toggle ${jobName}`);
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
        <div className="space-y-6 max-w-6xl">

            {/* MASTER TOGGLE */}
            <Card className={!enabled ? "border-destructive/50 bg-destructive/5" : ""}>
                <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                        <div className="space-y-1">
                            <h3 className="font-semibold flex items-center gap-2">
                                <Power className="h-4 w-4" />
                                {t('scheduler.masterSwitch')}
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                {t('scheduler.masterDesc')}
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={enabled ? "font-medium text-green-600" : "font-medium text-destructive"}>
                                {enabled ? 'ACTIVE' : 'SUSPENDED'}
                            </span>
                            <Switch checked={enabled} onCheckedChange={handleToggle} disabled={isSyncingScheduler} />
                        </div>
                    </div>
                </CardContent>
            </Card>


            {!enabled && (
                <Alert variant="destructive">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertTitle>System Paused</AlertTitle>
                    <AlertDescription>
                        Audit loops, auto-exports, backups, and email alerts are currently suspended.
                    </AlertDescription>
                </Alert>
            )}

            {/* TIMEZONE */}
            <SettingsSection title="System Timezone" description="Reference time for all schedules">
                <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{timezone} (Detected)</span>
                </div>
            </SettingsSection>

            {/* JOB STATUS (READ ONLY) */}
            <SettingsSection title="Job Status" description="Real-time status of scheduled background tasks">
                {isLoadingJobs ? (
                    <div className="flex justify-center p-4">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    </div>
                ) : (
                    <div className="rounded-md border">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Job Name</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Schedule (Cron)</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Actions</TableHead>
                                    <TableHead className="text-right">Next Run</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {jobs?.map((job) => (
                                    <TableRow key={job.name} className={!enabled ? "opacity-50" : ""}>
                                        <TableCell className="font-medium font-mono text-xs">{job.name}</TableCell>
                                        <TableCell>{job.description}</TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">{job.cron}</TableCell>
                                        <TableCell>
                                            <Badge variant={(enabled && job.enabled) ? "default" : "secondary"} className={(enabled && job.enabled) ? "bg-green-600 hover:bg-green-700" : ""}>
                                                {(enabled && job.enabled) ? 'Active' : 'Disabled'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
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
                                                    onClick={() => handleTriggerJob(job.name)}
                                                    disabled={!enabled || runningJobName === job.name}
                                                >
                                                    {runningJobName === job.name ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    ) : (
                                                        <Play className="h-3.5 w-3.5" />
                                                    )}
                                                </Button>
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs text-muted-foreground">
                                            {enabled && job.nextRun ? new Date(job.nextRun).toLocaleString() : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {(!jobs || jobs.length === 0) && (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                                            No active jobs found.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </SettingsSection>
        </div>
    );
}
