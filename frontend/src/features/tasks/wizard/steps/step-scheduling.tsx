import { useFormContext } from "react-hook-form";
import { useEffect } from "react";
import type { CreateTaskFormValues } from "../../schemas/task-creation.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { CalendarIcon, Info } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { formatDayOrdinal, getDateLocale } from "@/lib/date-locale";

import { RecurrenceSelector } from "../../components/recurrence-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getMinDateForRecurrence, validateTaskDate } from "@/utils/task-date-validation";



const SET_POS_INLINE_KEYS: Record<number, string> = {
    1: "firstInline",
    2: "secondInline",
    3: "thirdInline",
    4: "fourthInline",
    [-1]: "lastInline",
};

const PERIODICITIES_WITH_HINT = ['daily', 'weekly', 'monthly', 'yearly', 'custom'];

function isConsecutiveDays(days: number[]): boolean {
    if (!days || days.length < 2) return false;
    const sortedDays = [...days].sort((a, b) => a - b);
    let gapsGreaterThanOne = 0;

    for (let i = 0; i < sortedDays.length; i++) {
        const current = sortedDays[i];
        const next = sortedDays[(i + 1) % sortedDays.length];
        const diff = i === sortedDays.length - 1 ? (next + 7 - current) : (next - current);
        if (diff > 1) {
            gapsGreaterThanOne++;
        }
    }

    return gapsGreaterThanOne <= 1;
}

const EMPTY_WEEKDAYS: number[] = [];

interface StepSchedulingProps {
    fcEnabled?: boolean;
}

export function StepScheduling({ fcEnabled = false }: StepSchedulingProps) {
    const { t } = useTranslation();
    const dateLocale = getDateLocale();
    const { control, watch, setValue } = useFormContext<CreateTaskFormValues>();
    const periodicity = watch("periodicity");
    const bySetPos = watch("bySetPos");
    const byWeekday = watch("byWeekday") || EMPTY_WEEKDAYS;
    const byMonthDay = watch("byMonthDay");
    const startDate = watch("startDate");
    const customRuleType = watch("customRuleType");

    useEffect(() => {
        if ((customRuleType !== 'selected_weekdays' && customRuleType !== 'weeks_of_month') || !isConsecutiveDays(byWeekday)) {
            setValue("isContinuousBlock", false);
        }
    }, [customRuleType, byWeekday, setValue]);

    const minStartDate = getMinDateForRecurrence(periodicity || 'ONCE', 'startDate');
    const minEndDate = getMinDateForRecurrence(periodicity || 'ONCE', 'endDate');

    const monthlyPatternLabel = (() => {
        if (bySetPos && bySetPos !== 0 && byWeekday && byWeekday.length > 0) {
            const positionKey = SET_POS_INLINE_KEYS[bySetPos];
            const position = positionKey ? t(`taskWizard.positions.${positionKey}`) : String(bySetPos);
            const weekday = byWeekday[0] >= 0 && byWeekday[0] <= 6
                ? t(`taskWizard.weekdays.inline.${byWeekday[0]}`)
                : t('taskWizard.scheduling.unknownWeekday');
            return t('taskWizard.scheduling.monthlyNth', { position, weekday });
        }

        const day = byMonthDay || startDate?.getDate() || 1;
        return t('taskWizard.scheduling.monthlyDay', { day: formatDayOrdinal(day) });
    })();

    const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6].map((id) => ({ id, label: t(`taskWizard.weekdays.short.${id}`) }));
    const startHintKey = PERIODICITIES_WITH_HINT.includes(periodicity || '') ? periodicity : 'default';
    const startDescriptionKey = periodicity === 'weekly' || periodicity === 'monthly' ? periodicity : 'default';

    const toggleWeekday = (val: number, current: number[] = []) => {
        if (current.includes(val)) {
            return current.filter(d => d !== val);
        } else {
            return [...current, val].sort();
        }
    };



    return (
        <div className="space-y-6">
            {/* Informational Banners */}
            {periodicity === 'weekly' && (
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertDescription>
                        <Trans i18nKey="taskWizard.scheduling.weeklyInfo" components={{ strong: <strong /> }} />
                        <br />
                        <span className="text-xs opacity-80 mt-1 block">
                            {t('taskWizard.scheduling.weeklyInfoSub')}
                        </span>
                    </AlertDescription>
                </Alert>
            )}
            {periodicity === 'monthly' && (
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertDescription>
                        <Trans
                            i18nKey="taskWizard.scheduling.monthlyInfo"
                            values={{ pattern: monthlyPatternLabel }}
                            components={{ strong: <strong /> }}
                        />
                    </AlertDescription>
                </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Start Date */}
                <FormField
                    control={control}
                    name="startDate"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel className="flex items-center">
                                {t('taskWizard.scheduling.startDate')}
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 ml-2 text-blue-500 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {t(`taskWizard.scheduling.startDateHint.${startHintKey}`)}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button
                                            variant={"outline"}
                                            className={cn(
                                                "w-full pl-3 text-left font-normal",
                                                !field.value && "text-muted-foreground"
                                            )}
                                        >
                                            {field.value ? (
                                                format(field.value, "PPP", { locale: dateLocale })
                                            ) : (
                                                <span>{t('taskWizard.scheduling.pickDate')}</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value}
                                        onSelect={field.onChange}
                                        disabled={(date) => date < minStartDate}
                                        initialFocus
                                    />
                                </PopoverContent>
                            </Popover>
                            <FormDescription>
                                {(() => {
                                    if (field.value) {
                                        const res = validateTaskDate(periodicity || 'ONCE', field.value, 'startDate');
                                        if (!res.isValid) return <span className="text-destructive font-medium">{res.errorMessage}</span>;
                                    }
                                    return t(`taskWizard.scheduling.startDateDescription.${startDescriptionKey}`);
                                })()}
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* End Date (Yearly Only) */}
                {periodicity === 'yearly' && (
                    <FormField
                        control={control}
                        name="endDate"
                        render={({ field }) => (
                            <FormItem className="flex flex-col">
                                <FormLabel className="flex items-center">
                                    {t('taskWizard.scheduling.endDate')}
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-4 w-4 ml-2 text-blue-500 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                {t('taskWizard.scheduling.endDateHint')}
                                            </TooltipContent>
                                        </Tooltip>
                                    </TooltipProvider>
                                </FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <FormControl>
                                            <Button
                                                variant={"outline"}
                                                className={cn(
                                                    "w-full pl-3 text-left font-normal",
                                                    !field.value && "text-muted-foreground"
                                                )}
                                            >
                                                {field.value ? (
                                                    format(field.value, "PPP", { locale: dateLocale })
                                                ) : (
                                                    <span>{t('taskWizard.scheduling.pickDate')}</span>
                                                )}
                                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                            </Button>
                                        </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                            mode="single"
                                            selected={field.value}
                                            onSelect={field.onChange}
                                            disabled={(date) => date < minEndDate}
                                            initialFocus
                                        />
                                    </PopoverContent>
                                </Popover>
                                <FormDescription>
                                    {(() => {
                                        if (field.value) {
                                            const res = validateTaskDate(periodicity || 'ONCE', field.value, 'endDate');
                                            if (!res.isValid) return <span className="text-destructive font-medium">{res.errorMessage}</span>;
                                        }
                                        return t('taskWizard.scheduling.endDateDescription');
                                    })()}
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {/* Custom Rules (V2) */}
                {periodicity === 'custom' && (
                    <div className="col-span-1 md:col-span-2 space-y-6 border p-4 rounded-md bg-muted/10">
                        <h4 className="text-sm font-semibold">{t('taskWizard.scheduling.customPatternTitle')}</h4>

                        <FormField
                            control={control}
                            name="customRuleType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('taskWizard.scheduling.ruleType')}</FormLabel>
                                    <Select
                                        onValueChange={(val) => {
                                            field.onChange(val);
                                            // Reset irrelevant fields on type switch
                                            setValue('interval', 1, { shouldValidate: true });
                                            setValue('byWeekday', [], { shouldValidate: true });
                                            setValue('bySetPos', undefined, { shouldValidate: true });
                                            setValue('byYearDay', [], { shouldValidate: true });
                                        }}
                                        defaultValue={field.value}
                                    >
                                        <FormControl>
                                            <SelectTrigger><SelectValue placeholder={t('taskWizard.scheduling.selectRuleType')} /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="every_x_days">{t('taskWizard.scheduling.ruleTypes.every_x_days')}</SelectItem>
                                            <SelectItem value="selected_weekdays">{t('taskWizard.scheduling.ruleTypes.selected_weekdays')}</SelectItem>
                                            <SelectItem value="weeks_of_month">{t('taskWizard.scheduling.ruleTypes.weeks_of_month')}</SelectItem>
                                            <SelectItem value="days_of_year">{t('taskWizard.scheduling.ruleTypes.days_of_year')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {customRuleType && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-dashed">
                                {/* Common interval field for all custom types */}
                                <FormField
                                    control={control}
                                    name="interval"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t(`taskWizard.scheduling.intervalLabel.${customRuleType}`)}</FormLabel>
                                            <FormControl>
                                                <NumberInput
                                                    min={1}
                                                    {...field}
                                                    onChange={field.onChange}
                                                    value={field.value || 1}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                {t('taskWizard.scheduling.intervalHint')}
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {/* Selected Weekdays & Weeks of Month -> Weekday Chips */}
                                {(customRuleType === 'selected_weekdays' || customRuleType === 'weeks_of_month') && (
                                    <>
                                        <FormField
                                            control={control}
                                            name="byWeekday"
                                            render={({ field }) => (
                                                <FormItem className="col-span-1 md:col-span-2">
                                                    <FormLabel>{t('taskWizard.scheduling.weekdays')}</FormLabel>
                                                    <FormControl>
                                                        <div className="flex flex-wrap gap-2">
                                                            {WEEKDAYS.map((day) => {
                                                                const isSelected = field.value?.includes(day.id);
                                                                return (
                                                                    <Button
                                                                        key={day.id}
                                                                        type="button"
                                                                        variant={isSelected ? "default" : "outline"}
                                                                        size="sm"
                                                                        className="rounded-full"
                                                                        aria-pressed={isSelected}
                                                                        onClick={() => field.onChange(toggleWeekday(day.id, field.value))}
                                                                    >
                                                                        {day.label}
                                                                    </Button>
                                                                );
                                                            })}
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        {isConsecutiveDays(byWeekday) && (
                                            <FormField
                                                control={control}
                                                name="isContinuousBlock"
                                                render={({ field }) => (
                                                    <FormItem className="col-span-1 md:col-span-2 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm bg-muted/20">
                                                        <div className="space-y-0.5">
                                                            <FormLabel className="flex items-center gap-2">
                                                                {t('taskWizard.scheduling.continuousBlock')}
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger type="button" asChild>
                                                                            <Info className="h-4 w-4 text-blue-500 cursor-help" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            {t('taskWizard.scheduling.continuousBlockHint')}
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </FormLabel>
                                                            <FormDescription>
                                                                {t('taskWizard.scheduling.continuousBlockDescription')}
                                                            </FormDescription>
                                                        </div>
                                                        <FormControl>
                                                            <Switch
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                    </FormItem>
                                                )}
                                            />
                                        )}
                                    </>
                                )}

                                {/* Weeks of month -> Position in month */}
                                {customRuleType === 'weeks_of_month' && (
                                    <FormField
                                        control={control}
                                        name="bySetPos"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('taskWizard.scheduling.weekPosition')}</FormLabel>
                                                <Select
                                                    onValueChange={(val) => field.onChange(parseInt(val))}
                                                    value={field.value?.toString() || ""}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder={t('taskWizard.scheduling.weekPositionPlaceholder')} /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="1">{t('taskWizard.positions.first')}</SelectItem>
                                                        <SelectItem value="2">{t('taskWizard.positions.second')}</SelectItem>
                                                        <SelectItem value="3">{t('taskWizard.positions.third')}</SelectItem>
                                                        <SelectItem value="4">{t('taskWizard.positions.fourth')}</SelectItem>
                                                        <SelectItem value="-1">{t('taskWizard.positions.last')}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}

                                {/* Days of year -> Array input */}
                                {customRuleType === 'days_of_year' && (
                                    <FormField
                                        control={control}
                                        name="byYearDay"
                                        render={({ field }) => (
                                            <FormItem className="col-span-1 md:col-span-2">
                                                <FormLabel>{t('taskWizard.scheduling.daysOfYear')}</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder={t('taskWizard.scheduling.daysOfYearPlaceholder')}
                                                        value={field.value?.join(', ') || ''}
                                                        onChange={(e) => {
                                                            const str = e.target.value;
                                                            if (!str) field.onChange([]);
                                                            else {
                                                                const arr = str.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
                                                                field.onChange(arr);
                                                            }
                                                        }}
                                                    />
                                                </FormControl>
                                                <FormDescription>{t('taskWizard.scheduling.daysOfYearHint')}</FormDescription>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>
                        )}
                    </div>
                )}


            </div>

            {/* Rules Toggles */}
            <div className="space-y-4 pt-4 border-t">
                <h3 className="text-sm font-medium">{t('taskWizard.scheduling.businessRules')}</h3>

                <FormField
                    control={control}
                    name="skipWeekends"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>{t('taskWizard.scheduling.skipWeekends')}</FormLabel>
                                <FormDescription>
                                    {t('taskWizard.scheduling.skipWeekendsDescription')}
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="skipHolidays"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>{t('taskWizard.scheduling.skipHolidays')}</FormLabel>
                                <FormDescription>
                                    {t('taskWizard.scheduling.skipHolidaysDescription')}
                                </FormDescription>
                            </div>
                            <FormControl>
                                <Switch
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                />
                            </FormControl>
                        </FormItem>
                    )}
                />
            </div>

            {/* Recurrence Selector */}
            <RecurrenceSelector fcEnabled={fcEnabled} />
        </div>
    );
}
