import { useParams, useNavigate } from 'react-router-dom';
import { useTask } from '@/hooks/use-tasks';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { ArrowLeft, Play, Settings, Terminal, Activity, Users, Clock, Bell } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { tasksApi } from '@/api/tasks';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useTaskNotifications, useChannels } from '@/hooks/use-notifications';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';

export function TaskDetailsPage() {
    const { t } = useTranslation();
    const dateCode = getDateLocale().code;
    const { id } = useParams<{ id: string }>();
    const taskId = parseInt(id || '0', 10);
    const navigate = useNavigate();

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
            <div className="p-8 space-y-4">
                <Skeleton className="h-8 w-1/4" />
                <Skeleton className="h-[200px] w-full" />
            </div>
        );
    }

    if (!task) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-8">
                <h2 className="text-2xl font-bold mb-2">{t('taskDetails.notFound')}</h2>
                <Button onClick={() => navigate('/task-definitions')}>{t('taskDetails.backToTasks')}</Button>
            </div>
        );
    }

    return (
        <div className="flex-1 space-y-4 p-8 pt-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate('/task-definitions')}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            {task.name}
                            {task.isActive ? (
                                <Badge variant="default">{t('taskList.active')}</Badge>
                            ) : (
                                <Badge variant="secondary">{t('taskList.inactive')}</Badge>
                            )}
                        </h2>
                        <p className="text-muted-foreground font-mono text-sm mt-1">
                            {task.description || t('taskDetails.noDescription')}
                        </p>
                    </div>
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        onClick={() => runMutation.mutate(taskId)}
                        disabled={runMutation.isPending}
                    >
                        <Play className="mr-2 h-4 w-4" />
                        {t('taskDetails.runNow')}
                    </Button>
                    <Button variant="default" onClick={() => navigate(`/task-definitions/${taskId}/edit`)}>
                        <Settings className="mr-2 h-4 w-4" />
                        {t('tasks.editTask')}
                    </Button>
                </div>
            </div>

            <Tabs defaultValue="overview" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="overview">
                        <Activity className="mr-2 h-4 w-4" />
                        {t('taskDetails.tabs.overview')}
                    </TabsTrigger>
                    <TabsTrigger value="logs" disabled title={t('taskDetails.notImplemented')}>
                        <Terminal className="mr-2 h-4 w-4" />
                        {t('taskDetails.tabs.logs')}
                    </TabsTrigger>
                    <TabsTrigger value="configuration">
                        <Settings className="mr-2 h-4 w-4" />
                        {t('taskDetails.tabs.configuration')}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('taskWizard.definition.periodicity')}</CardTitle>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold capitalize">
                                    {t(`taskWizard.periodicities.${String(task.periodicity).toLowerCase()}.label`, { defaultValue: task.periodicity })}
                                </div>
                                <div className="flex flex-col gap-1 mt-1">
                                    <p className="text-xs text-muted-foreground">
                                        {t('taskDetails.start', { date: new Date(task.startDate).toLocaleDateString(dateCode) })}
                                    </p>
                                    {(task.skipWeekends || task.skipHolidays) && (
                                        <div className="flex gap-1 mt-1">
                                            {task.skipWeekends && <Badge variant="outline" className="text-[10px] px-1 h-5">{t('taskDetails.noWeekends')}</Badge>}
                                            {task.skipHolidays && <Badge variant="outline" className="text-[10px] px-1 h-5">{t('taskDetails.noHolidays')}</Badge>}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('tasks.assignments')}</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {(task.assignedUserIds?.length || 0) + (task.assignedGroupIds?.length || 0)}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {t('taskDetails.assignmentsSummary', { users: task.assignedUserIds?.length || 0, groups: task.assignedGroupIds?.length || 0 })}
                                </p>
                            </CardContent>
                        </Card>

                        {/* Schedule card */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('taskDetails.schedule')}</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent className="space-y-1">
                                {task.windowStartTime && task.windowEndTime ? (
                                    <div className="text-sm font-medium">
                                        {task.windowStartTime} → {task.windowEndTime}
                                    </div>
                                ) : (
                                    <div className="text-sm text-muted-foreground">{t('taskDetails.globalWindow')}</div>
                                )}
                                {task.timezone && (
                                    <p className="text-xs text-muted-foreground">{task.timezone}</p>
                                )}
                                {task.dueOffset ? (
                                    <p className="text-xs text-muted-foreground">{t('taskDetails.dueOffset', { n: task.dueOffset })}</p>
                                ) : null}
                                {task.recurrenceMode && task.recurrenceMode !== 'ON_SCHEDULE' && (
                                    <Badge variant="outline" className="text-[10px] px-1 h-5 mt-1">{task.recurrenceMode}</Badge>
                                )}
                            </CardContent>
                        </Card>

                        {/* Notifications card */}
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">{t('taskDetails.notifications')}</CardTitle>
                                <Bell className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                {!taskNotifications || taskNotifications.length === 0 ? (
                                    <p className="text-xs text-muted-foreground">{t('taskDetails.noChannels')}</p>
                                ) : (
                                    <div className="space-y-2">
                                        {taskNotifications.map((notif) => {
                                            const channel = allChannels?.find(c => c.id === notif.channelId);
                                            return (
                                                <div key={notif.channelId} className="text-xs space-y-0.5">
                                                    <div className="font-medium">{channel?.name ?? t('taskDetails.channelFallback', { id: notif.channelId })}</div>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {notif.notifyOnFailed && <Badge variant="destructive" className="text-[10px] px-1 h-4">{t('taskDetails.badges.fail')}</Badge>}
                                                        {notif.notifyOnMissing && <Badge variant="outline" className="text-[10px] px-1 h-4">{t('taskDetails.badges.missing')}</Badge>}
                                                        {notif.notifyOnReminder && <Badge variant="secondary" className="text-[10px] px-1 h-4">{t('taskDetails.badges.reminder')}</Badge>}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="configuration">
                    <Card>
                        <CardHeader>
                            <CardTitle>{t('taskDetails.configTitle')}</CardTitle>
                            <CardDescription>
                                {t('taskDetails.configDescription')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <h4 className="font-medium text-sm text-muted-foreground mb-1">{t('taskDetails.createdAt')}</h4>
                                    <p>{new Date(task.createdAt).toLocaleString(dateCode)}</p>
                                </div>
                                <div>
                                    <h4 className="font-medium text-sm text-muted-foreground mb-1">{t('taskDetails.updatedAt')}</h4>
                                    <p>{new Date(task.updatedAt).toLocaleString(dateCode)}</p>
                                </div>
                            </div>
                            {/* Add more config details here or reuse the Edit Form in read-only mode */}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
