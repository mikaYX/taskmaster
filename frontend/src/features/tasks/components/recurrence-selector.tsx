import { useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Clock, RotateCcw, Info } from "lucide-react";
import { useSettings } from "@/features/settings/hooks/use-settings";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

// We'll use a hardcoded list of common timezones for the prototype, or Intl
const COMMON_TIMEZONES = [
    "UTC",
    "Europe/Paris",
    "Europe/London",
    "America/New_York",
    "America/Los_Angeles",
    "Asia/Tokyo",
    "Australia/Sydney",
    "Asia/Hong_Kong",
    "Asia/Singapore",
    "Asia/Dubai",
    "Africa/Cairo",
    "Africa/Johannesburg",
    "America/Sao_Paulo",
    "Pacific/Auckland",
];

interface RecurrenceSelectorProps {
    fcEnabled: boolean; // prop for FROM_COMPLETION flag
}

export function RecurrenceSelector({ fcEnabled }: RecurrenceSelectorProps) {
    const { control, watch, setValue, getValues } = useFormContext();
    const periodicity = watch("periodicity");
    const { getSetting } = useSettings();

    // Default global window settings
    const defaultStart = getSetting('SCHEDULE_DEFAULT_START_TIME') || '08:00';
    const defaultEnd = getSetting('SCHEDULE_DEFAULT_END_TIME') || '18:00';
    const defaultTimezone = getSetting('SCHEDULE_DEFAULT_TIMEZONE') || getSetting('system.timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

    // Show recurrence fields only if periodicity is applicable
    const showRecurrenceFields = ["daily", "weekly", "monthly", "yearly", "custom"].includes(periodicity);

    useEffect(() => {
        if (showRecurrenceFields && !getValues("timezone")) {
            setValue("timezone", defaultTimezone, { shouldValidate: true });
        }
    }, [showRecurrenceFields, defaultTimezone, setValue, getValues]);

    if (!showRecurrenceFields) return null;

    return (
        <div className="space-y-4 border p-4 rounded-md bg-muted/20 mt-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">Advanced Scheduling</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Interval: Every X [Frequency] */}
                {periodicity !== 'custom' && (
                    <FormField
                        control={control}
                        name="interval"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>Repeat Every</FormLabel>
                                <div className="flex items-center gap-2">
                                    <FormControl>
                                        <NumberInput
                                            min={1}
                                            className="w-32"
                                            {...field}
                                            onChange={field.onChange}
                                            value={field.value || 1}
                                        />
                                    </FormControl>
                                    <span className="text-sm text-muted-foreground capitalize">
                                        {periodicity === 'daily' ? 'Days' :
                                            periodicity === 'weekly' ? 'Weeks' :
                                                periodicity === 'monthly' ? 'Months' :
                                                    periodicity === 'yearly' ? 'Years' :
                                                        'Cycles'}
                                    </span>
                                </div>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                <FormField
                    control={control}
                    name="timezone"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Timezone</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || defaultTimezone}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select timezone" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {COMMON_TIMEZONES.map((tz) => (
                                        <SelectItem key={tz} value={tz}>
                                            {tz}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                <FormField
                    control={control}
                    name="dueOffset"
                    render={({ field }) => (
                        <FormItem>
                            <div className="flex items-center gap-2">
                                <FormLabel>Due Offset (Minutes)</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-blue-500 hover:text-blue-600">
                                            <Info className="h-4 w-4 text-blue-500" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 text-sm">
                                        <p className="font-semibold mb-2">Qu'est-ce que l'offset ?</p>
                                        <p className="text-muted-foreground mb-4">
                                            L'offset définit le délai supplémentaire accordé au-delà de la fin de la fenêtre planifiée pour compléter la tâche.
                                        </p>
                                        <div className="bg-muted p-2 rounded text-xs">
                                            <strong>Exemple :</strong><br />
                                            Si la fenêtre se termine à <strong>18:00</strong> avec un offset de <strong>120 minutes</strong>, la tâche sera considérée en retard ("Due") à partir de <strong>20:00</strong>.
                                        </div>
                                    </PopoverContent>
                                </Popover>
                            </div>
                            <FormControl>
                                <NumberInput
                                    min={0}
                                    placeholder="0"
                                    {...field}
                                    onChange={field.onChange}
                                    value={field.value !== undefined ? field.value : 0}
                                />
                            </FormControl>
                            <FormDescription>
                                Time to complete task after scheduled time.
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Recurrence Mode Selector - Only if Feature Flag Enabled */}
                {fcEnabled && (
                    <FormField
                        control={control}
                        name="recurrenceMode"
                        render={({ field }) => (
                            <FormItem className="col-span-2">
                                <FormLabel>Recurrence Mode</FormLabel>
                                <FormControl>
                                    <RadioGroup
                                        onValueChange={field.onChange}
                                        value={field.value}
                                        className="flex flex-col space-y-1"
                                    >
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <RadioGroupItem value="ON_SCHEDULE" />
                                            </FormControl>
                                            <FormLabel className="font-normal">
                                                On Schedule (Strict time-based)
                                            </FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <RadioGroupItem value="FROM_COMPLETION" />
                                            </FormControl>
                                            <FormLabel className="font-normal">
                                                From Completion (Rolling based on last success)
                                            </FormLabel>
                                        </FormItem>
                                    </RadioGroup>
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />
                )}

                {/* Time Window (Scheduling Windows V2) */}
                <div className="col-span-1 md:col-span-2 border p-4 rounded-md space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <FormLabel className="flex items-center gap-2">
                                <Clock className="h-4 w-4" /> Time Window
                            </FormLabel>
                            <FormDescription>
                                Defines the allowed execution window for the task.
                            </FormDescription>
                        </div>
                        <FormField
                            control={control}
                            name="useGlobalWindowDefaults"
                            render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormLabel className="font-normal text-sm">
                                        Use global defaults
                                    </FormLabel>
                                    <FormControl>
                                        <Switch
                                            checked={field.value !== false}
                                            onCheckedChange={(checked) => {
                                                field.onChange(checked);
                                                if (!checked) {
                                                    // Initialize with defaults when manual mode is activated
                                                    setValue("windowStartTime", defaultStart, { shouldValidate: true });
                                                    setValue("windowEndTime", defaultEnd, { shouldValidate: true });
                                                } else {
                                                    // Clean up overrides when returning to global defaults
                                                    setValue("windowStartTime", null, { shouldValidate: true });
                                                    setValue("windowEndTime", null, { shouldValidate: true });
                                                }
                                            }}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                    </div>

                    {!watch("useGlobalWindowDefaults") && watch("useGlobalWindowDefaults") !== undefined && (
                        <div className="grid grid-cols-2 gap-4 mt-2">
                            <FormField
                                control={control}
                                name="windowStartTime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Start Time</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} value={field.value || defaultStart} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={control}
                                name="windowEndTime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>End Time</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} value={field.value || defaultEnd} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="col-span-2 flex justify-end">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setValue("windowStartTime", defaultStart, { shouldValidate: true });
                                        setValue("windowEndTime", defaultEnd, { shouldValidate: true });
                                    }}
                                >
                                    <RotateCcw className="h-3 w-3 mr-2" />
                                    Reset to Defaults
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Monthly specific: Day of Month vs Nth Weekday */}
                {periodicity === 'monthly' && (
                    <div className="col-span-2 border-t pt-4 mt-2">
                        <FormLabel className="block mb-2">Monthly Pattern</FormLabel>
                        <div className="flex gap-4">
                            <FormField
                                control={control}
                                name="bySetPos"
                                render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <Select
                                            onValueChange={(val) => field.onChange(Number(val))}
                                            value={field.value?.toString()}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="On Day..." />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="0">Specific Date (e.g. 15th)</SelectItem>
                                                <SelectItem value="1">First</SelectItem>
                                                <SelectItem value="2">Second</SelectItem>
                                                <SelectItem value="3">Third</SelectItem>
                                                <SelectItem value="4">Fourth</SelectItem>
                                                <SelectItem value="-1">Last</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )}
                            />

                            {/* If specific date (bySetPos is falsy/0), show byMonthDay input */}
                            {(!watch("bySetPos") || watch("bySetPos") === 0) ? (
                                <FormField
                                    control={control}
                                    name="byMonthDay"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <NumberInput
                                                min={1} max={31}
                                                placeholder="Day (1-31)"
                                                {...field}
                                                onChange={field.onChange}
                                                value={field.value || 1}
                                            />
                                        </FormItem>
                                    )}
                                />
                            ) : (
                                <FormField
                                    control={control}
                                    name="byWeekday"
                                    render={({ field }) => (
                                        <FormItem className="flex-1">
                                            <Select
                                                onValueChange={(val) => field.onChange([Number(val)])}
                                                value={field.value?.[0]?.toString()}
                                            >
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Weekday" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="0">Monday</SelectItem>
                                                    <SelectItem value="1">Tuesday</SelectItem>
                                                    <SelectItem value="2">Wednesday</SelectItem>
                                                    <SelectItem value="3">Thursday</SelectItem>
                                                    <SelectItem value="4">Friday</SelectItem>
                                                    <SelectItem value="5">Saturday</SelectItem>
                                                    <SelectItem value="6">Sunday</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )}
                                />
                            )}
                        </div>
                    </div>
                )}
            </div>
            {/* Hidden recurrenceMode field handled in form submit or default logic */}
        </div>
    );
}
