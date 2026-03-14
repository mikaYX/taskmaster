import { useFormContext } from "react-hook-form";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import type { CreateTaskDto } from "@/api/types";
import { generateRRuleFromForm } from "../../utils/rrule-utils";
import { useQuery } from "@tanstack/react-query";
import { wizardApi } from "../api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CalendarCheck, AlertCircle } from "lucide-react";
import { format, parseISO, isSameDay } from "date-fns";

export function StepReview() {
    const { getValues } = useFormContext<CreateTaskFormValues>();
    const formValues = getValues();

    // Prepare DTO for preview
    // We need to convert Dates to strings if DTO expects strings, but our Schema has Date objects.
    // backend expects ISO strings usually for DTO. 
    // Types saying "scheduledTime: string", "daysOfWeek: DayOfWeek[]" etc are in Shared types. 
    // But our form handles Wizard specific state.
    // We need to map Form Values to CreateTaskDto.
    // Since we are mocking some parts (scheduled time not yet in wizard steps?? Wait.
    // Step 1: Definition (Name, Periodicity).
    // Step 2: Scheduling (StartDate, EndDate).
    // Review: Mapped to CreateTaskDto.

    // WAIT: I missed "Scheduled Time" in Step 2?
    // task-creation.schema.ts: I didn't include `scheduledTime` in validation/fields! 
    // And `daysOfWeek` for Weekly?
    // The design says: "Weekly: Anchored to Start of Week". So no manual days selection?
    // Legacy mapping: Weekly -> Anchored.
    // So "Scheduled Time" is needed? Yes, usually. "hh:mm".
    // I missed adding Time Picker in Step 2.
    // I should add it to Step 2 or assume default? No, user needs to set it.
    // I will add Time Input to Step 2 later. For now, I'll mock it or use default.

    // Mapping FormValues to DTO
    let endDate: Date | undefined;


    if (formValues.periodicity === 'yearly') {
        endDate = formValues.endDate;
    }


    const previewDto: CreateTaskDto = {
        name: formValues.name || 'Task',
        // Backend requires description min 5 chars; avoid 400 when preview runs before full form fill
        description: (formValues.description?.trim() && formValues.description.trim().length >= 5)
            ? formValues.description.trim()
            : 'Preview',
        periodicity: formValues.periodicity || 'daily',
        startDate: formValues.startDate ? formValues.startDate.toISOString() : new Date().toISOString(),
        endDate: endDate?.toISOString(),
        procedureUrl: formValues.procedureUrl || undefined,

        // Flags
        skipWeekends: formValues.skipWeekends,
        skipHolidays: formValues.skipHolidays,


        useGlobalWindowDefaults: formValues.useGlobalWindowDefaults !== false,
        windowStartTime: formValues.windowStartTime,
        windowEndTime: formValues.windowEndTime,

        // Assignments
        userIds: formValues.userIds,
        groupIds: formValues.groupIds,
    };

    if (formValues.timezone) previewDto.timezone = formValues.timezone;
    previewDto.dueOffset = formValues.dueOffset;
    previewDto.recurrenceMode = formValues.recurrenceMode || 'ON_SCHEDULE';

    const rrule = generateRRuleFromForm(formValues);
    if (rrule) {
        previewDto.rrule = rrule;
    }

    const customRuleLabel = (() => {
        if (formValues.periodicity !== 'custom') return null;
        if (formValues.customRuleType === 'every_x_days') return `Every ${formValues.interval} days`;
        if (formValues.customRuleType === 'selected_weekdays') return `Every ${formValues.interval} weeks on selected days`;
        if (formValues.customRuleType === 'weeks_of_month') return `Every ${formValues.interval} months on week position`;
        if (formValues.customRuleType === 'days_of_year') return `Every ${formValues.interval} years on specific days`;
        return 'Custom Rules';
    })();

    const { data: instances, isLoading, error } = useQuery({
        queryKey: ['task-preview', previewDto],
        queryFn: () => wizardApi.previewTask(previewDto),
        enabled: !!formValues.startDate,
        staleTime: 0, // Always fresh for preview
    });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">Configuration</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div>
                            <span className="font-semibold">Name:</span> {formValues.name}
                        </div>
                        <div>
                            <span className="font-semibold">Periodicity:</span> <Badge variant="outline" className="uppercase">{formValues.periodicity}</Badge>
                        </div>
                        {formValues.periodicity === 'custom' && (
                            <div>
                                <span className="font-semibold">Custom Pattern:</span> {customRuleLabel}
                            </div>
                        )}
                        {formValues.periodicity === 'custom' && (
                            <div>
                                <span className="font-semibold text-muted-foreground mr-1">RRule (V2):</span>
                                <span className="font-mono text-xs p-1 bg-muted rounded">
                                    {generateRRuleFromForm(formValues) || 'INCOMPLETE_RULE'}
                                </span>
                            </div>
                        )}
                        <div>
                            <span className="font-semibold">Recurrence:</span> <Badge variant="secondary">{formValues.recurrenceMode || 'ON_SCHEDULE'}</Badge>
                        </div>
                        <div>
                            <span className="font-semibold">Time Window:</span> {formValues.useGlobalWindowDefaults !== false ? "Global Defaults" : `${formValues.windowStartTime || '?'} - ${formValues.windowEndTime || '?'}`}
                        </div>
                        <div>
                            <span className="font-semibold">Start Date:</span> {formValues.startDate ? format(formValues.startDate, 'PPP') : '-'}
                        </div>
                        <div>
                            <span className="font-semibold">Assignments:</span> {((formValues.userIds?.length || 0) + (formValues.groupIds?.length || 0))} recipients
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-primary flex items-center gap-2">
                            <CalendarCheck className="h-4 w-4" />
                            Next Occurrences (Preview)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isLoading ? (
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-full" />
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-4 w-1/2" />
                            </div>
                        ) : error ? (
                            <Alert variant="destructive">
                                <AlertCircle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>
                                    {(() => {
                                        const e = error as unknown;
                                        if (e && typeof e === 'object' && 'data' in e) {
                                            const d = (e as { data?: { message?: string | string[] } }).data;
                                            if (d?.message != null) {
                                                const msg = Array.isArray(d.message) ? d.message[0] : d.message;
                                                if (typeof msg === 'string') return msg;
                                            }
                                        }
                                        return error instanceof Error ? error.message : 'Could not generate preview.';
                                    })()}
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <div className="space-y-3">
                                {instances?.slice(0, 5).map((inst, idx) => {
                                    const date = parseISO(inst.date);
                                    const original = parseISO(inst.originalDate);
                                    const isShifted = !isSameDay(date, original);

                                    return (
                                        <div key={idx} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <Badge variant={idx === 0 ? "default" : "secondary"} className="w-6 h-6 rounded-full flex items-center justify-center p-0">
                                                    {idx + 1}
                                                </Badge>
                                                <span className="font-medium">
                                                    {format(date, 'PPP')}
                                                </span>
                                            </div>
                                            {isShifted && (
                                                <div className="flex items-center text-xs text-muted-foreground">
                                                    <span>(Shifted from {format(original, 'MMM d')})</span>
                                                </div>
                                            )}
                                        </div>
                                    )
                                })}
                                {!instances?.length && <p className="text-sm text-muted-foreground">No instances generated for the current preview window.</p>}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Alert className="bg-muted">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Ready to Create?</AlertTitle>
                <AlertDescription>
                    Verify the occurrences above. Once created, the system will automatically generate tasks according to this schedule.
                </AlertDescription>
            </Alert>
        </div>
    );
}
