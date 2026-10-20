import { useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTaskSchema } from "../schemas/task-creation.schema";
import type { CreateTaskFormValues } from "../schemas/task-creation.schema";
import type { CreateTaskDto } from "@/api/types";
import { Bell, CalendarClock, ClipboardCheck, FileText, Users } from "lucide-react";
import { WizardLayout } from "./wizard-layout";
import { StepDefinition } from "./steps/step-definition";
import { StepScheduling } from "./steps/step-scheduling";
import { StepAssignment } from "./steps/step-assignment";
import { StepReview } from "./steps/step-review";
import { StepNotifications } from "./steps/step-notifications";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useCreateTask } from "@/hooks/use-tasks";
import { generateRRuleFromForm } from "../utils/rrule-utils";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { tasksApi } from "@/api/tasks";
import { notificationsApi } from "@/api/notifications";

const STEP_KEYS = ['definition', 'scheduling', 'assignment', 'notifications', 'review'] as const;
const STEP_ICONS = [FileText, CalendarClock, Users, Bell, ClipboardCheck];

export default function WizardPage() {
    const { t } = useTranslation();
    const steps = STEP_KEYS.map((key, index) => ({
        title: t(`taskWizard.steps.${key}.title`),
        description: t(`taskWizard.steps.${key}.description`),
        icon: STEP_ICONS[index],
    }));
    const [currentStep, setCurrentStep] = useState(0);
    const navigate = useNavigate();
    const createTaskMutation = useCreateTask();

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
            useGlobalWindowDefaults: true,
            skipWeekends: false,
            skipHolidays: false,
            userIds: [],
            groupIds: [],
        }
    });

    const { trigger, getValues } = methods;



    const handleNext = async () => {
        let valid = false;

        if (currentStep === 0) {
            valid = await trigger(['name', 'description', 'periodicity', 'procedureUrl', 'executionChecklist']);
        } else if (currentStep === 1) {
            const p = getValues('periodicity');
            // Cast strictly to known keys
            const fields: (keyof CreateTaskFormValues)[] = ['startDate'];
            if (p === 'yearly') fields.push('endDate' as keyof CreateTaskFormValues);
            if (p === 'custom') {
                fields.push('customRuleType', 'interval', 'byWeekday', 'bySetPos', 'byYearDay');
            }

            // Validate V2 fields inherently
            if (getValues('useGlobalWindowDefaults') === false) {
                fields.push('windowStartTime', 'windowEndTime');
            }

            valid = await trigger(fields);
        } else if (currentStep === 2) {
            valid = true;
        } else if (currentStep === 3) {
            valid = true;
        } else {
            onSubmit();
            return;
        }

        if (valid) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        setCurrentStep(prev => Math.max(0, prev - 1));
    };

    const onSubmit = async () => {
        try {
            const data = getValues();

            // Safe access for conditional fields
            let endDate: string | undefined;

            if (data.periodicity === 'yearly' && data.endDate) {
                endDate = format(data.endDate, 'yyyy-MM-dd');
            }

            // Construct payload strictly matching CreateTaskDto (Whitelist)
            const payload: CreateTaskDto = {
                name: data.name,
                description: data.description,
                executionChecklist: data.executionChecklist ?? [],
                periodicity: data.periodicity,
                priority: data.priority,
                startDate: data.startDate ? format(data.startDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
                endDate: endDate,
                procedureUrl: data.procedureMode === 'URL' ? (data.procedureUrl || undefined) : undefined,

                skipWeekends: data.skipWeekends,
                skipHolidays: data.skipHolidays,

                userIds: data.userIds,
                groupIds: data.groupIds,
            };

            // Timezone is optional but if set we send it
            if (data.timezone) {
                payload.timezone = data.timezone;
            }

            // Allow user selection if flag enabled, else default to ON_SCHEDULE
            if (fcEnabled && data.recurrenceMode) {
                payload.recurrenceMode = data.recurrenceMode;
            } else {
                payload.recurrenceMode = 'ON_SCHEDULE';
            }

            if (data.dueOffset !== undefined && data.dueOffset !== null) {
                payload.dueOffset = data.dueOffset;
            }

            // Generate RRule
            const rrule = generateRRuleFromForm(data);
            if (rrule) {
                payload.rrule = rrule;
            } else if (payload.recurrenceMode === 'FROM_COMPLETION') {
                toast.error(t('taskWizard.toasts.invalidConfig'), { description: t('taskWizard.toasts.fromCompletionNoRule') });
                return;
            } else {
                toast.error(t('taskWizard.toasts.invalidConfig'), { description: t('taskWizard.toasts.recurrentNeedsRule') });
                return;
            }

            // Scheduling Windows V2
            payload.useGlobalWindowDefaults = data.useGlobalWindowDefaults !== false;
            if (!payload.useGlobalWindowDefaults) {
                payload.windowStartTime = data.windowStartTime;
                payload.windowEndTime = data.windowEndTime;
            }

            const createdTask = await createTaskMutation.mutateAsync(payload);

            if (data.notifications && data.notifications.length > 0) {
                try {
                    await notificationsApi.saveTaskNotifications(createdTask.id, { notifications: data.notifications });
                } catch (err) {
                    console.error("Failed to save notifications", err);
                    toast.warning(t('taskWizard.toasts.created'), { description: t('taskWizard.toasts.notificationsFailed') });
                }
            }

            if (data.procedureMode === 'UPLOAD' && data.procedureFile) {
                try {
                    await tasksApi.uploadProcedure(createdTask.id, data.procedureFile as File);
                } catch (err) {
                    console.error("Failed to upload file, task was created but procedure is missing.", err);
                    toast.warning(t('taskWizard.toasts.created'), { description: t('taskWizard.toasts.uploadFailed') });
                    navigate('/task-definitions');
                    return;
                }
            }

            toast.success(t('taskWizard.toasts.created'), { description: t('taskWizard.toasts.createdDescription') });
            navigate('/task-definitions');
        } catch (error) {
            console.error(error);
            toast.error(t('taskWizard.toasts.error'), { description: t('taskWizard.toasts.createFailed') });
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl pb-24 pt-4 sm:pt-6">
            <FormProvider {...methods}>
                <WizardLayout
                    currentStep={currentStep}
                    steps={steps}
                    onNext={handleNext}
                    onBack={handleBack}
                    canNext={true}
                    isSubmitting={createTaskMutation.isPending}
                    nextLabel={currentStep === 4 ? t('taskWizard.createButton') : t('common.next')}
                >
                    <div className="min-h-[300px]">
                        {currentStep === 0 && <StepDefinition />}
                        {currentStep === 1 && <StepScheduling fcEnabled={fcEnabled} />}
                        {currentStep === 2 && <StepAssignment />}
                        {currentStep === 3 && <StepNotifications />}
                        {currentStep === 4 && <StepReview />}
                    </div>
                </WizardLayout>
            </FormProvider>
        </div>
    );
}
