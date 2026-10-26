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
import { Trans, useTranslation } from "react-i18next";
import { useSettings } from "@/features/settings/hooks/use-settings";
import { useSites } from "@/hooks/use-sites";
import { useAuthStore } from "@/stores/auth-store";
import { useSiteStore } from "@/stores/site-store";
import { COMMON_TIMEZONES } from "@/lib/timezones";
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

interface RecurrenceSelectorProps {
    fcEnabled: boolean; // prop for FROM_COMPLETION flag
}

export function RecurrenceSelector({ fcEnabled }: RecurrenceSelectorProps) {
    const { t } = useTranslation();
    const { control, watch, setValue, getValues } = useFormContext();
    const periodicity = watch("periodicity");
    const { getSetting } = useSettings();

    // Default global window settings
    const defaultStart = getSetting('SCHEDULE_DEFAULT_START_TIME') || '08:00';
    const defaultEnd = getSetting('SCHEDULE_DEFAULT_END_TIME') || '18:00';
    const globalTimezone = getSetting('SCHEDULE_DEFAULT_TIMEZONE') || getSetting('system.timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';

    // A new task is created on the selected site, or the user's default site when
    // none is selected (same rule as the backend), so that site's timezone, when
    // set, takes precedence over the global default.
    const userSites = useAuthStore((s) => s.sites);
    const selectedSiteId = useSiteStore((s) => s.currentSiteId);
    const { data: sites, isLoading: sitesLoading } = useSites();
    const defaultSiteId = selectedSiteId ?? (userSites?.find((s) => s.isDefault) ?? userSites?.[0])?.siteId;
    const siteTimezone = sites?.find((s) => s.id === defaultSiteId)?.timezone;
    const defaultTimezone = siteTimezone || globalTimezone;
    const timezoneOptions = COMMON_TIMEZONES.includes(defaultTimezone) ? COMMON_TIMEZONES : [defaultTimezone, ...COMMON_TIMEZONES];

    // Show recurrence fields only if periodicity is applicable
    const showRecurrenceFields = ["daily", "weekly", "monthly", "yearly", "custom"].includes(periodicity);

    useEffect(() => {
        // Wait for the sites so a site default is not overwritten by the global one.
        if (showRecurrenceFields && !sitesLoading && !getValues("timezone")) {
            setValue("timezone", defaultTimezone, { shouldValidate: true });
        }
    }, [showRecurrenceFields, sitesLoading, defaultTimezone, setValue, getValues]);

    if (!showRecurrenceFields) return null;

    return (
        <div className="space-y-4 border p-4 rounded-md bg-muted/20 mt-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('taskWizard.recurrence.advanced')}</h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Interval: Every X [Frequency] */}
                {periodicity !== 'custom' && (
                    <FormField
                        control={control}
                        name="interval"
                        render={({ field }) => (
                            <FormItem>
                                <FormLabel>{t('taskWizard.recurrence.repeatEvery')}</FormLabel>
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
                                        {t(`taskWizard.recurrence.units.${['daily', 'weekly', 'monthly', 'yearly'].includes(periodicity) ? periodicity : 'custom'}`)}
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
                            <FormLabel>{t('taskWizard.recurrence.timezone')}</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || defaultTimezone}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t('taskWizard.recurrence.selectTimezone')} />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    {timezoneOptions.map((tz) => (
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
                                <FormLabel>{t('taskWizard.recurrence.dueOffset')}</FormLabel>
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button type="button" className="text-blue-500 hover:text-blue-600">
                                            <Info className="h-4 w-4 text-blue-500" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 text-sm">
                                        <p className="font-semibold mb-2">{t('taskWizard.recurrence.offsetHelpTitle')}</p>
                                        <p className="text-muted-foreground mb-4">
                                            {t('taskWizard.recurrence.offsetHelpBody')}
                                        </p>
                                        <div className="bg-muted p-2 rounded text-xs">
                                            <Trans
                                                i18nKey="taskWizard.recurrence.offsetExample"
                                                components={{ strong: <strong />, br: <br /> }}
                                            />
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
                                {t('taskWizard.recurrence.dueOffsetDescription')}
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
                                <FormLabel>{t('taskWizard.recurrence.mode')}</FormLabel>
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
                                                {t('taskWizard.recurrence.onSchedule')}
                                            </FormLabel>
                                        </FormItem>
                                        <FormItem className="flex items-center space-x-3 space-y-0">
                                            <FormControl>
                                                <RadioGroupItem value="FROM_COMPLETION" />
                                            </FormControl>
                                            <FormLabel className="font-normal">
                                                {t('taskWizard.recurrence.fromCompletion')}
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
                                <Clock className="h-4 w-4" /> {t('taskWizard.recurrence.timeWindow')}
                            </FormLabel>
                            <FormDescription>
                                {t('taskWizard.recurrence.timeWindowDescription')}
                            </FormDescription>
                        </div>
                        <FormField
                            control={control}
                            name="useGlobalWindowDefaults"
                            render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                    <FormLabel className="font-normal text-sm">
                                        {t('taskWizard.recurrence.useGlobalDefaults')}
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
                                        <FormLabel>{t('taskWizard.recurrence.startTime')}</FormLabel>
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
                                        <FormLabel>{t('taskWizard.recurrence.endTime')}</FormLabel>
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
                                    {t('taskWizard.recurrence.resetToDefaults')}
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Monthly specific: Day of Month vs Nth Weekday */}
                {periodicity === 'monthly' && (
                    <div className="col-span-2 border-t pt-4 mt-2">
                        <FormLabel className="block mb-2">{t('taskWizard.recurrence.monthlyPattern')}</FormLabel>
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
                                                    <SelectValue placeholder={t('taskWizard.recurrence.onDay')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="0">{t('taskWizard.recurrence.specificDate')}</SelectItem>
                                                <SelectItem value="1">{t('taskWizard.positions.first')}</SelectItem>
                                                <SelectItem value="2">{t('taskWizard.positions.second')}</SelectItem>
                                                <SelectItem value="3">{t('taskWizard.positions.third')}</SelectItem>
                                                <SelectItem value="4">{t('taskWizard.positions.fourth')}</SelectItem>
                                                <SelectItem value="-1">{t('taskWizard.positions.last')}</SelectItem>
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
                                                placeholder={t('taskWizard.recurrence.dayPlaceholder')}
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
                                                        <SelectValue placeholder={t('taskWizard.recurrence.weekdayPlaceholder')} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {[0, 1, 2, 3, 4, 5, 6].map((day) => (
                                                        <SelectItem key={day} value={String(day)}>
                                                            {t(`taskWizard.weekdays.long.${day}`)}
                                                        </SelectItem>
                                                    ))}
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
