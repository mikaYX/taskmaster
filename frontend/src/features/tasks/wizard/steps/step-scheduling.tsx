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

import { RecurrenceSelector } from "../../components/recurrence-selector";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { getMinDateForRecurrence, validateTaskDate } from "@/utils/task-date-validation";



const MONTHLY_WEEKDAY_LABELS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
];

const MONTHLY_SET_POS_LABELS: Record<number, string> = {
    1: "first",
    2: "second",
    3: "third",
    4: "fourth",
    [-1]: "last",
};

function toOrdinal(day: number): string {
    if (day % 10 === 1 && day % 100 !== 11) return `${day}st`;
    if (day % 10 === 2 && day % 100 !== 12) return `${day}nd`;
    if (day % 10 === 3 && day % 100 !== 13) return `${day}rd`;
    return `${day}th`;
}

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
            const position = MONTHLY_SET_POS_LABELS[bySetPos] || `${bySetPos}th`;
            const weekday = MONTHLY_WEEKDAY_LABELS[byWeekday[0]] || "day";
            return `${position} ${weekday} of every month`;
        }

        const day = byMonthDay || startDate?.getDate() || 1;
        return `${toOrdinal(day)} day of every month`;
    })();

    const WEEKDAYS = [
        { id: 0, label: 'Mon' },
        { id: 1, label: 'Tue' },
        { id: 2, label: 'Wed' },
        { id: 3, label: 'Thu' },
        { id: 4, label: 'Fri' },
        { id: 5, label: 'Sat' },
        { id: 6, label: 'Sun' },
    ];

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
                        This task will automatically anchor to the <strong>Start of the Week</strong> based on your country settings (e.g. Monday for FR, Sunday for US).
                        <br />
                        <span className="text-xs opacity-80 mt-1 block">
                            Weekly tasks are valid for the entire week. Validation can occur at any time during this period.
                        </span>
                    </AlertDescription>
                </Alert>
            )}
            {periodicity === 'monthly' && (
                <Alert className="bg-blue-50 text-blue-900 border-blue-200">
                    <Info className="h-4 w-4 text-blue-500" />
                    <AlertDescription>
                        This task recurs on the <strong>{monthlyPatternLabel}</strong>.
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
                                Start Date
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Info className="h-4 w-4 ml-2 text-blue-500 cursor-help" />
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {periodicity === 'daily' && 'Daily tasks must start today or later'}
                                            {periodicity === 'weekly' && 'Weekly tasks can start as early as today'}
                                            {periodicity === 'monthly' && 'Monthly tasks can start as early as today'}
                                            {periodicity === 'yearly' && 'Yearly tasks can start as early as today'}
                                            {periodicity === 'custom' && 'Custom tasks cannot have past start dates'}
                                            {!['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(periodicity || '') && 'Tasks must start today or later'}
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
                                                format(field.value, "PPP")
                                            ) : (
                                                <span>Pick a date</span>
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
                                    return periodicity === 'weekly' ? "Determines the first week." :
                                        periodicity === 'monthly' ? "Determines the first month." :
                                            "The first occurrence date.";
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
                                    End Date
                                    <TooltipProvider>
                                        <Tooltip>
                                            <TooltipTrigger asChild>
                                                <Info className="h-4 w-4 ml-2 text-blue-500 cursor-help" />
                                            </TooltipTrigger>
                                            <TooltipContent>
                                                Yearly tasks can be due as early as January 1st of last year
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
                                                    format(field.value, "PPP")
                                                ) : (
                                                    <span>Pick a date</span>
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
                                        return "Defines the end of the yearly data block.";
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
                        <h4 className="text-sm font-semibold">Custom Recurrence Pattern</h4>

                        <FormField
                            control={control}
                            name="customRuleType"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Rule Type</FormLabel>
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
                                            <SelectTrigger><SelectValue placeholder="Select rule type..." /></SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                            <SelectItem value="every_x_days">Every X days</SelectItem>
                                            <SelectItem value="selected_weekdays">Selected weekdays</SelectItem>
                                            <SelectItem value="weeks_of_month">Weeks of month</SelectItem>
                                            <SelectItem value="days_of_year">Days of year</SelectItem>
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
                                            <FormLabel>Interval (Every {customRuleType.replace(/_/g, ' ')})</FormLabel>
                                            <FormControl>
                                                <NumberInput
                                                    min={1}
                                                    {...field}
                                                    onChange={field.onChange}
                                                    value={field.value || 1}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                e.g. interval=2 means "every other"
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
                                                    <FormLabel>Weekdays</FormLabel>
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
                                                                Treat as a continuous block
                                                                <TooltipProvider>
                                                                    <Tooltip>
                                                                        <TooltipTrigger type="button" asChild>
                                                                            <Info className="h-4 w-4 text-blue-500 cursor-help" />
                                                                        </TooltipTrigger>
                                                                        <TooltipContent>
                                                                            If enabled, tasks will span continuously from the first selected day to the last, rather than creating separate daily instances.
                                                                        </TooltipContent>
                                                                    </Tooltip>
                                                                </TooltipProvider>
                                                            </FormLabel>
                                                            <FormDescription>
                                                                Makes the recurrence an unbroken time span instead of detached days.
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
                                                <FormLabel>Week Position</FormLabel>
                                                <Select
                                                    onValueChange={(val) => field.onChange(parseInt(val))}
                                                    value={field.value?.toString() || ""}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger><SelectValue placeholder="e.g. First, Last..." /></SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="1">First</SelectItem>
                                                        <SelectItem value="2">Second</SelectItem>
                                                        <SelectItem value="3">Third</SelectItem>
                                                        <SelectItem value="4">Fourth</SelectItem>
                                                        <SelectItem value="-1">Last</SelectItem>
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
                                                <FormLabel>Days of Year</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        placeholder="e.g. 1, 150, 365"
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
                                                <FormDescription>Comma-separated list of days (1-366).</FormDescription>
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
                <h3 className="text-sm font-medium">Business Rules</h3>

                <FormField
                    control={control}
                    name="skipWeekends"
                    render={({ field }) => (
                        <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                            <div className="space-y-0.5">
                                <FormLabel>Skip Weekends</FormLabel>
                                <FormDescription>
                                    Shift instance to Monday if it falls on Sat/Sun.
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
                                <FormLabel>Skip Holidays</FormLabel>
                                <FormDescription>
                                    Shift instance to next business day if it falls on a Holiday.
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
