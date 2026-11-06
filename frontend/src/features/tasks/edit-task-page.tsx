import { useEffect } from "react";
import { format } from "date-fns";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useTask, useUpdateTask } from "@/hooks/use-tasks";
import { buildEditTaskSchema, type CreateTaskFormValues } from "./schemas/task-creation.schema";
import { StepDefinition } from "./wizard/steps/step-definition";
import { StepScheduling } from "./wizard/steps/step-scheduling";
import { StepAssignment } from "./wizard/steps/step-assignment";
import { StepNotifications } from "./wizard/steps/step-notifications";
import { normalizeNotifications } from "./utils/normalize-notifications";
import { useTaskNotifications, useSaveTaskNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { parseRRuleToForm } from "./utils/rrule-parser";
import { generateRRuleFromForm } from "./utils/rrule-utils";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Save, ArrowLeft, Bell, CalendarClock, FileText, Loader2, Pencil, Users } from "lucide-react";
import type { UpdateTaskDto } from "@/api/types";
import { tasksApi } from "@/api/tasks";

/** `yyyy-MM-dd` of a date picked in the form, or undefined when it is still the saved one. */
function changedDay(picked: Date | undefined, saved: string | Date | null | undefined): string | undefined {
    if (!picked) return undefined;
    const day = format(picked, 'yyyy-MM-dd');
    return saved && format(new Date(saved), 'yyyy-MM-dd') === day ? undefined : day;
}

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

    // A task that already started in the past must stay editable.
    const editSchema = buildEditTaskSchema({
        startDate: task?.startDate ? new Date(task.startDate) : undefined,
        endDate: task?.endDate ? new Date(task.endDate) : undefined,
    });

    const methods = useForm<CreateTaskFormValues>({
        // @ts-expect-error - Discriminated union type mismatch with RHF resolver
        resolver: zodResolver(editSchema),
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



                notifications: normalizeNotifications(existingNotifications),

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
    const onSubmit = async (data: CreateTaskFormValues): Promise<boolean> => {
        try {
            const payload: UpdateTaskDto = {
                name: data.name,
                description: data.description,
                executionChecklist: data.executionChecklist ?? [],
                periodicity: data.periodicity,
                priority: data.priority,
                // The API refuses a date in the past: only send a date that was changed.
                startDate: changedDay(data.startDate, task?.startDate),
                endDate: data.periodicity === 'yearly' ? changedDay(data.endDate, task?.endDate) : undefined,
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
                return false;
            } else {
                toast.error(t('taskEdit.toasts.invalidConfig'), { description: t('taskEdit.toasts.recurrentNeedsRule') });
                return false;
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
                    return false;
                }
            }

            toast.success(t('taskEdit.toasts.updated'));
            return true;
        } catch (error) {
            console.error(error);
            toast.error(t('taskEdit.toasts.updateFailed'));
            return false;
        }
    };

    const handleSaveAndClose = async (e: React.MouseEvent<HTMLButtonElement>) => {
        let saved = false;
        try {
            await handleSubmit(
                async (d) => {
                    saved = await onSubmit(d as unknown as CreateTaskFormValues);
                },
                (errors) => {
                    // Without this the form stayed silently invalid and nothing was saved.
                    console.error('Task form is invalid', errors);
                    toast.error(t('taskEdit.toasts.invalidForm'));
                },
            )(e);
        } catch {
            // request error: already reported by onSubmit
        }
        // Stay on the page when something went wrong, so the error can be read and fixed.
        if (saved) navigate(`/task-definitions/${taskId}`);
    };

    if (isLoading) {
        return (
            <div className="mx-auto w-full max-w-6xl space-y-6 py-6">
                <Skeleton className="h-12 w-80 rounded-xl" />
                <Skeleton className="h-[420px] w-full rounded-xl" />
            </div>
        );
    }
    if (!task) return <div className="mx-auto max-w-md py-20 text-center text-lg font-semibold">{t('taskEdit.notFound')}</div>;

    const saving = updateTaskMutation.isPending || saveNotificationsMutation.isPending;
    const sections = [
        { value: 'definition', icon: FileText, title: t('taskWizard.steps.definition.title'), description: t('taskEdit.sections.definition') },
        { value: 'scheduling', icon: CalendarClock, title: t('taskWizard.steps.scheduling.title'), description: t('taskEdit.sections.scheduling') },
        { value: 'assignment', icon: Users, title: t('taskWizard.steps.assignment.title'), description: t('taskEdit.sections.assignment') },
        { value: 'notifications', icon: Bell, title: t('taskWizard.steps.notifications.title'), description: t('taskEdit.sections.notifications') },
    ];

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-24 pt-4 sm:pt-6">
            <Button variant="ghost" size="sm" className="-ml-2 gap-2 text-muted-foreground" onClick={() => navigate(`/task-definitions/${taskId}`)}>
                <ArrowLeft className="h-4 w-4" />
                {t('taskEdit.backToTask')}
            </Button>

            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <Pencil className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="break-words text-2xl font-bold tracking-tight">{t('taskEdit.title', { name: task.name })}</h1>
                        <p className="text-sm text-muted-foreground">{t('taskEdit.subtitle')}</p>
                    </div>
                </div>
                <Button className="gap-2 shadow-sm" onClick={(e) => { void handleSaveAndClose(e); }} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {t('taskEdit.saveChanges')}
                </Button>
            </div>

            <FormProvider {...methods}>
                <Tabs defaultValue="definition" className="gap-6 md:data-[orientation=horizontal]:flex-row">
                    <TabsList className="h-auto group-data-[orientation=horizontal]/tabs:h-auto w-full shrink-0 flex-row flex-wrap justify-start gap-1 rounded-xl border bg-card p-2 shadow-sm md:sticky md:top-4 md:w-64 md:flex-col md:items-stretch md:self-start">
                        {sections.map(({ value, icon: Icon, title, description }) => (
                            <TabsTrigger
                                key={value}
                                value={value}
                                className="group h-auto flex-none justify-start gap-3 rounded-lg px-3 py-2.5 text-left data-[state=active]:bg-primary/5 data-[state=active]:shadow-none md:w-full"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-data-[state=active]:bg-primary group-data-[state=active]:text-primary-foreground">
                                    <Icon className="h-4 w-4" />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-sm font-medium">{title}</span>
                                    <span className="hidden whitespace-normal text-[11px] font-normal text-muted-foreground md:block">{description}</span>
                                </span>
                            </TabsTrigger>
                        ))}
                    </TabsList>

                    {sections.map(({ value, icon: Icon, title, description }) => (
                        <TabsContent key={value} value={value} className="mt-0 min-w-0 flex-1">
                            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                                <div className="flex flex-wrap items-center gap-3 border-b px-6 py-5">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                                        <Icon className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <h2 className="text-lg font-semibold leading-tight">{title}</h2>
                                        <p className="text-sm text-muted-foreground">{description}</p>
                                    </div>
                                    {value === 'notifications' && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            className="gap-2"
                                            onClick={() => { void saveNotifications(); }}
                                            disabled={saveNotificationsMutation.isPending}
                                        >
                                            <Save className="h-4 w-4" />
                                            {t('taskEdit.saveNotifications')}
                                        </Button>
                                    )}
                                </div>
                                <div className="space-y-4 px-6 py-6">
                                    {value === 'definition' && <StepDefinition />}
                                    {value === 'scheduling' && <StepScheduling fcEnabled={fcEnabled} />}
                                    {value === 'assignment' && <StepAssignment />}
                                    {value === 'notifications' && <StepNotifications />}
                                </div>
                                <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-4">
                                    <Button variant="outline" onClick={() => navigate(`/task-definitions/${taskId}`)}>
                                        {t('common.cancel')}
                                    </Button>
                                    <Button className="gap-2" onClick={(e) => { void handleSaveAndClose(e); }} disabled={saving}>
                                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                        {t('taskEdit.saveChanges')}
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    ))}
                </Tabs>
            </FormProvider>
        </div>
    );
}
