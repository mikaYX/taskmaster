import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTask } from '@/hooks/use-tasks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    ArrowLeft,
    Bell,
    CalendarClock,
    CalendarDays,
    ClipboardList,
    Clock,
    History,
    Pencil,
    Play,
    Repeat,
    SearchX,
    User,
    Users,
    type LucideIcon,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { tasksApi } from '@/api/tasks';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTaskNotifications, useChannels } from '@/hooks/use-notifications';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
import { useIsAdminOrManager } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { periodicityTone } from './task-style';
import { TaskAssignmentsSheet } from './components/task-assignments-sheet';
import { TaskDelegationsSheet } from './components/task-delegations-sheet';

/** One block of the overview: an icon, a title, and what is set. */
function InfoCard({
    icon: Icon,
    title,
    tone,
    action,
    children,
}: {
    icon: LucideIcon;
    title: string;
    tone: string;
    action?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <section className="flex flex-col rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
                    <Icon className="h-4 w-4" />
                </span>
                <h2 className="flex-1 text-sm font-semibold">{title}</h2>
                {action}
            </div>
            <div className="flex-1 space-y-2 text-sm">{children}</div>
        </section>
    );
}

export function TaskDetailsPage() {
    const { t } = useTranslation();
    const dateCode = getDateLocale().code;
    const { id } = useParams<{ id: string }>();
    const taskId = parseInt(id || '0', 10);
    const navigate = useNavigate();
    const isManager = useIsAdminOrManager();
    const [assignmentsOpen, setAssignmentsOpen] = useState(false);
    const [delegationsOpen, setDelegationsOpen] = useState(false);

    // Hooks
    const { data: task, isLoading } = useTask(taskId);
    const { data: taskNotifications } = useTaskNotifications(taskId);
    const { data: allChannels } = useChannels();

    const runMutation = useMutation({
        mutationFn: (id: number) => tasksApi.run(id),
        onSuccess: (data) => {
            if (data?.mode === 'DRY_RUN') {
                toast.info(t('taskDetails.dryRun'), { description: data.message });
            } else {
                toast.success(t('taskDetails.triggered'), { description: data?.message });
            }
        },
        onError: () => {
            toast.error(t('taskDetails.triggerFailed'));
        }
    });

    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-6xl space-y-6 py-6">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-36 w-full rounded-xl" />
                <div className="grid gap-4 md:grid-cols-2">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-40 rounded-xl" />
                </div>
            </div>
        );
    }

    if (!task) {
        return (
            <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <SearchX className="h-7 w-7 text-muted-foreground" />
                </div>
                <h2 className="mb-4 text-xl font-semibold">{t('taskDetails.notFound')}</h2>
                <Button onClick={() => navigate('/task-definitions')}>{t('taskDetails.backToTasks')}</Button>
            </div>
        );
    }

    const users = task.assignedUserIds?.length || 0;
    const groups = task.assignedGroupIds?.length || 0;
    const now = new Date();
    const activeDelegations = task.delegations?.filter(d => new Date(d.startAt) <= now && new Date(d.endAt) > now) || [];
    const periodicityLabel = t(`taskWizard.periodicities.${String(task.periodicity).toLowerCase()}.label`, { defaultValue: task.periodicity });

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-24 pt-4 sm:pt-6">
            <Button variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground" onClick={() => navigate('/task-definitions')}>
                <ArrowLeft className="h-4 w-4" />
                {t('taskDetails.backToTasks')}
            </Button>

            {/* ========== HERO ========== */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', periodicityTone(task.periodicity))}>
                            <ClipboardList className="h-7 w-7" />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h1 className="break-words text-2xl font-bold tracking-tight">{task.name}</h1>
                                <span
                                    className={cn(
                                        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                        task.isActive
                                            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                            : 'bg-muted text-muted-foreground',
                                    )}
                                >
                                    <span className={cn('h-1.5 w-1.5 rounded-full', task.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                                    {task.isActive ? t('taskList.active') : t('taskList.inactive')}
                                </span>
                                {activeDelegations.length > 0 && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">
                                        <CalendarClock className="h-3 w-3" />
                                        {activeDelegations.length > 1
                                            ? t('taskList.delegatedMany', { n: activeDelegations.length })
                                            : t('taskList.delegated')}
                                    </span>
                                )}
                            </div>
                            <p className={cn('mt-1.5 max-w-2xl whitespace-pre-line text-sm', task.description ? 'text-muted-foreground' : 'italic text-muted-foreground/70')}>
                                {task.description || t('taskDetails.noDescription')}
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                            variant="outline"
                            className="gap-2"
                            onClick={() => runMutation.mutate(taskId)}
                            disabled={runMutation.isPending}
                        >
                            <Play className="h-4 w-4" />
                            {t('taskDetails.runNow')}
                        </Button>
                        <Button className="gap-2 shadow-sm" onClick={() => navigate(`/task-definitions/${taskId}/edit`)}>
                            <Pencil className="h-4 w-4" />
                            {t('tasks.editTask')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* ========== OVERVIEW ========== */}
            <div className="grid gap-4 md:grid-cols-2">
                <InfoCard icon={Repeat} title={t('taskWizard.definition.periodicity')} tone={periodicityTone(task.periodicity)}>
                    <p className="text-lg font-semibold">{periodicityLabel}</p>
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" />
                        {t('taskDetails.start', { date: new Date(task.startDate).toLocaleDateString(dateCode) })}
                    </p>
                    {(task.skipWeekends || task.skipHolidays) && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            {task.skipWeekends && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{t('taskDetails.noWeekends')}</span>}
                            {task.skipHolidays && <span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{t('taskDetails.noHolidays')}</span>}
                        </div>
                    )}
                </InfoCard>

                <InfoCard icon={Clock} title={t('taskDetails.schedule')} tone="bg-sky-500/10 text-sky-700 dark:text-sky-400">
                    {task.windowStartTime && task.windowEndTime ? (
                        <p className="text-lg font-semibold tabular-nums">{task.windowStartTime} → {task.windowEndTime}</p>
                    ) : (
                        <p className="text-muted-foreground">{t('taskDetails.globalWindow')}</p>
                    )}
                    {task.timezone && <p className="text-muted-foreground">{task.timezone}</p>}
                    {task.dueOffset ? <p className="text-muted-foreground">{t('taskDetails.dueOffset', { n: task.dueOffset })}</p> : null}
                    {task.recurrenceMode && task.recurrenceMode !== 'ON_SCHEDULE' && (
                        <Badge variant="outline" className="text-[10px]">{task.recurrenceMode}</Badge>
                    )}
                </InfoCard>

                <InfoCard
                    icon={Users}
                    title={t('tasks.assignments')}
                    tone="bg-violet-500/10 text-violet-700 dark:text-violet-400"
                    action={isManager && (
                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAssignmentsOpen(true)}>
                            {t('taskDetails.manage')}
                        </Button>
                    )}
                >
                    {users + groups === 0 ? (
                        <p className="text-amber-600 dark:text-amber-400">{t('taskList.noAssignments')}</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {users > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-xs">
                                    <User className="h-3.5 w-3.5" />
                                    {t('taskList.userCount', { n: users })}
                                </span>
                            )}
                            {groups > 0 && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
                                    <Users className="h-3.5 w-3.5" />
                                    {t('taskList.groupCount', { n: groups })}
                                </span>
                            )}
                        </div>
                    )}
                    <div className="flex items-center justify-between border-t pt-3 text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5" />
                            {activeDelegations.length > 0
                                ? t('taskDetails.delegationsActive', { count: activeDelegations.length })
                                : t('taskDetails.noDelegation')}
                        </span>
                        {isManager && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setDelegationsOpen(true)}>
                                {t('taskList.actions.manageDelegations')}
                            </Button>
                        )}
                    </div>
                </InfoCard>

                <InfoCard icon={Bell} title={t('taskDetails.notifications')} tone="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    {!taskNotifications || taskNotifications.length === 0 ? (
                        <p className="text-muted-foreground">{t('taskDetails.noChannels')}</p>
                    ) : (
                        <ul className="space-y-2">
                            {taskNotifications.map((notif) => {
                                const channel = allChannels?.find(c => c.id === notif.channelId);
                                return (
                                    <li key={notif.channelId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2">
                                        <span className="font-medium">{channel?.name ?? t('taskDetails.channelFallback', { id: notif.channelId })}</span>
                                        <span className="flex flex-wrap gap-1">
                                            {notif.notifyOnFailed && <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">{t('taskDetails.badges.fail')}</Badge>}
                                            {notif.notifyOnMissing && <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{t('taskDetails.badges.missing')}</Badge>}
                                            {notif.notifyOnReminder && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{t('taskDetails.badges.reminder')}</Badge>}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </InfoCard>
            </div>

            {/* ========== FOOTER INFO ========== */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />
                    {t('taskDetails.createdAt')} {new Date(task.createdAt).toLocaleString(dateCode)}
                </span>
                <span>
                    {t('taskDetails.updatedAt')} {new Date(task.updatedAt).toLocaleString(dateCode)}
                </span>
            </div>

            <TaskAssignmentsSheet task={task} open={assignmentsOpen} onOpenChange={setAssignmentsOpen} />
            <TaskDelegationsSheet task={task} open={delegationsOpen} onOpenChange={setDelegationsOpen} />
        </div>
    );
}
