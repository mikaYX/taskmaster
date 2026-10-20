import { useEffect } from "react";
import { format } from "date-fns";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTask, useUpdateTask } from "@/hooks/use-tasks";
import { createTaskSchema, type CreateTaskFormValues } from "./schemas/task-creation.schema";
import { StepDefinition } from "./wizard/steps/step-definition";
import { StepScheduling } from "./wizard/steps/step-scheduling";
import { StepAssignment } from "./wizard/steps/step-assignment";
import { StepNotifications } from "./wizard/steps/step-notifications";
import { useTaskNotifications, useSaveTaskNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRRuleToForm } from "./utils/rrule-parser";
import { generateRRuleFromForm } from "./utils/rrule-utils";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ArrowLeft } from "lucide-react";
import type { UpdateTaskDto } from "@/api/types";
import { tasksApi } from "@/api/tasks";

export function EditTaskPage() {
    const { t } = useTranslation();
    const { id } = useParams<{ id: string }>();
    const taskId = parseInt(id || '0', 10);
    const navigate = useNavigate();

    // Hooks
    const { data: task, isLoading } = useTask(taskId);
    const updateTaskMutation = useUpdateTask();
    const saveNotificationsMutation = useSaveTaskNotifications();
    const { data: existingNotifications } = useTaskNotifications(taskId);
    const { getSettingAsBool } = useSettings();
    const fcEnabled = getSettingAsBool('FROM_COMPLETION_ENABLED');

    const methods = useForm<CreateTaskFormValues>({
        // @ts-expect-error - Discriminated union type mismatch with RHF resolver
        resolver: zodResolver(createTaskSchema),
        mode: "onChange",
        defaultValues: {
            periodicity: 'daily',
            priority: 'MEDIUM',
            recurrenceMode: 'ON_SCHEDULE',
            skipWeekends: false,
            skipHolidays: false,
            userIds: [],
            groupIds: [],
        }
    });

    const { reset, handleSubmit, getValues } = methods;

    // Load Task Data
    useEffect(() => {
        if (task) {
            // Parse V2 fields if available
            // If mode is FROM_COMPLETION, we also rely on rrule, but specific parsing might differ if not standard rrule
            // For now assuming existing parser works or we just take raw values if needed
            const v2Values = (task.rrule)
                ? parseRRuleToForm(task.rrule)
                : {};

            // Map Backend Task to Form Values
            const isUpload = task.procedureUrl && task.procedureUrl.startsWith('local:');
            const formValues: Partial<CreateTaskFormValues> = {
                name: task.name,
                description: task.description || '',
                executionChecklist: task.executionChecklist ?? [],
                priority: task.priority ?? 'MEDIUM',
                procedureMode: isUpload ? 'UPLOAD' : 'URL',
                procedureUrl: isUpload ? undefined : (task.procedureUrl || undefined),
                periodicity: (task.periodicity as "daily" | "weekly" | "monthly" | "yearly" | "custom") || 'daily',
                startDate: new Date(task.startDate),
                endDate: task.endDate ? new Date(task.endDate) : undefined,

                recurrenceMode: (task.recurrenceMode as "ON_SCHEDULE" | "FROM_COMPLETION") || 'ON_SCHEDULE',

                // Scheduling Windows
                useGlobalWindowDefaults: task.useGlobalWindowDefaults ?? true,
                windowStartTime: task.windowStartTime || undefined,
                windowEndTime: task.windowEndTime || undefined,

                timezone: task.timezone || undefined,
                dueOffset: task.dueOffset || undefined,

                skipWeekends: task.skipWeekends,
                skipHolidays: task.skipHolidays,

                userIds: task.assignedUserIds || [],
                groupIds: task.assignedGroupIds || [],



                notifications: existingNotifications ?? [],

                // Merge V2 parsed values (interval, byWeekday, etc.)
                ...v2Values,
            };

            reset(formValues as CreateTaskFormValues);
        }
    }, [task, existingNotifications, reset]);

    const saveNotifications = async () => {
        const notifications = getValues('notifications');
        try {
            await saveNotificationsMutation.mutateAsync({
                taskId,
                notifications: notifications ?? [],
            });
            toast.success(t('taskEdit.toasts.notificationsSaved'));
        } catch {
            toast.error(t('taskEdit.toasts.notificationsFailed'));
        }
    };
    const onSubmit = async (data: CreateTaskFormValues) => {
        try {
            const payload: UpdateTaskDto = {
                name: data.name,
                description: data.description,
                executionChecklist: data.executionChecklist ?? [],
                periodicity: data.periodicity,
                priority: data.priority,
                startDate: data.startDate ? format(data.startDate, 'yyyy-MM-dd') : undefined,
                endDate: (data.periodicity === 'yearly' && data.endDate) ? format(data.endDate, 'yyyy-MM-dd') : undefined,
                procedureUrl: data.procedureMode === 'URL' ? (data.procedureUrl || '') : undefined,

                skipWeekends: data.skipWeekends,
                skipHolidays: data.skipHolidays,
            };

            // strict V2 mode
            if (data.timezone) payload.timezone = data.timezone;
            if (data.dueOffset !== undefined) payload.dueOffset = data.dueOffset;

            // Handle Recurrence Mode
            if (fcEnabled && data.recurrenceMode) {
                payload.recurrenceMode = data.recurrenceMode;
            } else {
                payload.recurrenceMode = 'ON_SCHEDULE';
            }

            // Scheduling Windows V2
            payload.useGlobalWindowDefaults = data.useGlobalWindowDefaults !== false;
            if (!payload.useGlobalWindowDefaults) {
                payload.windowStartTime = data.windowStartTime;
                payload.windowEndTime = data.windowEndTime;
            }

            const rrule = generateRRuleFromForm(data);
            if (rrule) {
                payload.rrule = rrule;
            } else if (payload.recurrenceMode === 'FROM_COMPLETION') {
                // If from completion, we must have an RRule (or valid pattern to generate it)
                toast.error(t('taskEdit.toasts.invalidConfig'), { description: t('taskEdit.toasts.fromCompletionNoRule') });
                return;
            } else {
                toast.error(t('taskEdit.toasts.invalidConfig'), { description: t('taskEdit.toasts.recurrentNeedsRule') });
                return;
            }

            // Explicitly cast or construct object matching useUpdateTask signature
            await updateTaskMutation.mutateAsync({ id: taskId, dto: payload });

            // Save notifications
            if (data.notifications !== undefined) {
                await saveNotificationsMutation.mutateAsync({
                    taskId,
                    notifications: data.notifications,
                });
            }

            if (data.procedureMode === 'UPLOAD' && data.procedureFile && data.procedureFile instanceof File) {
                try {
                    await tasksApi.uploadProcedure(taskId, data.procedureFile);
                } catch (err) {
                    console.error("Failed to upload procedure file during edit:", err);
                    toast.warning(t('taskEdit.toasts.updated'), { description: t('taskEdit.toasts.uploadFailed') });
                    navigate(`/task-definitions/${taskId}`);
                    return;
                }
            }

            toast.success(t('taskEdit.toasts.updated'));
        } catch (error) {
            console.error(error);
            toast.error(t('taskEdit.toasts.updateFailed'));
        }
    };

    const handleSaveAndClose = async (e: React.MouseEvent<HTMLButtonElement>) => {
        try {
            await handleSubmit((d) => onSubmit(d as unknown as CreateTaskFormValues))(e);
        } catch {
            // validation failed or request error — navigate anyway
        }
        navigate(`/task-definitions/${taskId}`);
    };

    if (isLoading) return <div className="p-8"><Skeleton className="h-[400px]" /></div>;
    if (!task) return <div className="p-8">{t('taskEdit.notFound')}</div>;

    return (
        <div className="flex-1 space-y-4 p-8 pt-6 max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(`/task-definitions/${taskId}`)}>
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <h2 className="text-2xl font-bold tracking-tight">{t('taskEdit.title', { name: task.name })}</h2>
                </div>
                <Button onClick={(e) => { void handleSaveAndClose(e); }} disabled={updateTaskMutation.isPending || saveNotificationsMutation.isPending}>
                    <Save className="mr-2 h-4 w-4" />
                    {t('taskEdit.saveChanges')}
                </Button>
            </div>

            <FormProvider {...methods}>
                <Tabs defaultValue="definition" className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="definition">{t('taskWizard.steps.definition.title')}</TabsTrigger>
                        <TabsTrigger value="scheduling">{t('taskWizard.steps.scheduling.title')}</TabsTrigger>
                        <TabsTrigger value="assignment">{t('taskWizard.steps.assignment.title')}</TabsTrigger>
                        <TabsTrigger value="notifications">{t('taskWizard.steps.notifications.title')}</TabsTrigger>
                    </TabsList>

                    <TabsContent value="definition">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('taskEdit.basicInformation')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <StepDefinition />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="scheduling">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('taskEdit.schedulingRecurrence')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <StepScheduling fcEnabled={fcEnabled} />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="assignment">
                        <Card>
                            <CardHeader>
                                <CardTitle>{t('tasks.assignments')}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <StepAssignment />
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="notifications">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <CardTitle>{t('taskWizard.steps.notifications.title')}</CardTitle>
                                <Button
                                    type="button"
                                    size="sm"
                                    onClick={() => { void saveNotifications(); }}
                                    disabled={saveNotificationsMutation.isPending}
                                >
                                    <Save className="mr-2 h-4 w-4" />
                                    {t('taskEdit.saveNotifications')}
                                </Button>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <StepNotifications />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </FormProvider>
        </div>
    );
}
