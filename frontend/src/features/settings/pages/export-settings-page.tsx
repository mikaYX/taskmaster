import { useEffect, useState, useRef, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { SettingsSection } from '../components/settings-section';
import { useSettings } from '../hooks/use-settings';
import { exportSettingsSchema } from '../schemas/settings-schemas';
import { RecipientSelector } from '../components/recipient-selector';
import { CronPreview } from '../components/cron-preview';
import { exportApi } from '@/api/export';
import { schedulerApi } from '@/api/scheduler';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Download, Trash2, Mail, Clock, Calendar, CheckCircle2, XCircle, AlertTriangle, Play, Settings, FolderOpen, CalendarDays, Info, FileText, History, RefreshCw } from 'lucide-react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormDescription,
} from "@/components/ui/form";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';

type RangeMode = 'rolling' | 'fixed';

export function ExportSettingsPage() {
    const { settings, getSetting, updateSetting, isLoading, isUpdating, emailConfigStatus } = useSettings();
    const [isTesting, setIsTesting] = useState(false);
    const [isRunningNow, setIsRunningNow] = useState(false);
    const [isCleaning, setIsCleaning] = useState(false);
    const isInitialized = useRef(false);
    const [rangeMode, setRangeMode] = useState<RangeMode>('rolling');

    // Fetch scheduler jobs to get export job status
    const { data: jobsData } = useQuery({
        queryKey: ['scheduler-jobs'],
        queryFn: () => schedulerApi.getJobs(),
        refetchInterval: 30000, // Refresh every 30s
    });

    // Fetch export files list
    const { data: exportFiles, refetch: refetchExports } = useQuery({
        queryKey: ['export-files'],
        queryFn: () => exportApi.list(),
    });

    const exportJob = jobsData?.find(j => j.name === 'auto-export');

    const form = useForm({
        resolver: zodResolver(exportSettingsSchema),
        defaultValues: {
            autoExport: {
                enabled: false,
                scheduleType: 'daily' as 'daily' | 'weekly' | 'monthly' | 'custom',
                dayOfWeek: 1,
                dayOfMonth: 1,
                monthMode: 'specific' as 'specific' | 'last' | 'relative',
                weekOrdinal: 'first' as 'first' | 'second' | 'third' | 'fourth' | 'last',
                cron: '0 0 * * *',
                formats: ['csv'] as ('csv' | 'pdf')[],
                email: {
                    enabled: false,
                    formats: ['csv'] as ('csv' | 'pdf')[],
                    recipients: [] as string[],
                    customEmails: [] as string[],
                }
            },
            config: {
                path: './exports',
                offsetFrom: 30,
                offsetTo: 0,
            },
            retention: {
                days: 30,
            }
        },
    });

    // Track form dirty state
    const isDirty = form.formState.isDirty;

    // Helper function to safely parse array values from settings
    const parseArraySetting = (value: unknown, defaultValue: string[] = []): string[] => {
        if (Array.isArray(value)) return value as string[];
        if (typeof value === 'string') return value.split(',').filter(Boolean);
        return defaultValue;
    };

    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            isInitialized.current = true;
            form.reset({
                autoExport: {
                    enabled: getSetting('export.autoExport.enabled') === 'true',
                    scheduleType: (getSetting('export.autoExport.scheduleType') as 'daily' | 'weekly' | 'monthly' | 'custom') || 'daily',
                    dayOfWeek: parseInt(getSetting('export.autoExport.dayOfWeek') || '1'),
                    dayOfMonth: parseInt(getSetting('export.autoExport.dayOfMonth') || '1'),
                    monthMode: (getSetting('export.autoExport.monthMode') as 'specific' | 'last' | 'relative') || 'specific',
                    weekOrdinal: (getSetting('export.autoExport.weekOrdinal') as 'first' | 'second' | 'third' | 'fourth' | 'last') || 'first',
                    cron: getSetting('export.autoExport.cron') || '0 0 * * *',
                    formats: parseArraySetting(getSetting('export.autoExport.formats'), ['csv']) as ('csv' | 'pdf')[],
                    email: {
                        enabled: getSetting('export.autoExport.email.enabled') === 'true',
                        formats: parseArraySetting(getSetting('export.autoExport.email.formats'), ['csv']) as ('csv' | 'pdf')[],
                        recipients: parseArraySetting(getSetting('export.autoExport.email.recipients'), ['admin']),
                        customEmails: parseArraySetting(getSetting('export.autoExport.email.customEmails'), []),
                    }
                },
                config: {
                    path: getSetting('export.path') || './exports',
                    offsetFrom: parseInt(getSetting('export.offset.from') || '30'),
                    offsetTo: parseInt(getSetting('export.offset.to') || '0'),
                },
                retention: {
                    days: parseInt(getSetting('export.retention.days') || '30'),
                }
            });
        }
    }, [settings.length, form, getSetting]);

    const onSubmit = (data: z.infer<typeof exportSettingsSchema>) => {
        // Auto Export
        updateSetting({ key: 'export.autoExport.enabled', value: String(data.autoExport.enabled) });
        updateSetting({ key: 'export.autoExport.scheduleType', value: data.autoExport.scheduleType });
        updateSetting({ key: 'export.autoExport.dayOfWeek', value: String(data.autoExport.dayOfWeek) });
        updateSetting({ key: 'export.autoExport.dayOfMonth', value: String(data.autoExport.dayOfMonth) });
        updateSetting({ key: 'export.autoExport.monthMode', value: data.autoExport.monthMode });
        updateSetting({ key: 'export.autoExport.weekOrdinal', value: data.autoExport.weekOrdinal });
        updateSetting({ key: 'export.autoExport.cron', value: data.autoExport.cron });
        updateSetting({ key: 'export.autoExport.formats', value: data.autoExport.formats.join(',') });

        // Email
        updateSetting({ key: 'export.autoExport.email.enabled', value: String(data.autoExport.email.enabled) });
        updateSetting({ key: 'export.autoExport.email.formats', value: data.autoExport.email.formats.join(',') });
        updateSetting({ key: 'export.autoExport.email.recipients', value: data.autoExport.email.recipients.join(',') });
        updateSetting({ key: 'export.autoExport.email.customEmails', value: data.autoExport.email.customEmails.join(',') });

        // Config
        updateSetting({ key: 'export.path', value: data.config.path });
        updateSetting({ key: 'export.offset.from', value: String(data.config.offsetFrom) });
        updateSetting({ key: 'export.offset.to', value: String(data.config.offsetTo) });

        // Retention
        updateSetting({ key: 'export.retention.days', value: String(data.retention.days) });
    };

    const handleRunNow = async () => {
        setIsRunningNow(true);
        try {
            const res = await exportApi.test();
            toast.success(`Export generated: ${res.filename}`);
            refetchExports();
        } catch {
            toast.error('Export failed');
        } finally {
            setIsRunningNow(false);
        }
    };

    const handleTestEmail = async () => {
        setIsTesting(true);
        try {
            await exportApi.testEmail(form.getValues('autoExport.email.recipients'));
            toast.success('Test email sent');
        } catch {
            toast.error('Email failed');
        } finally {
            setIsTesting(false);
        }
    };

    const handleCleanup = async () => {
        setIsCleaning(true);
        try {
            const res = await exportApi.cleanup();
            toast.success(`Cleaned up ${res.deleted} files`);
            refetchExports();
        } catch {
            toast.error('Cleanup failed');
        } finally {
            setIsCleaning(false);
        }
    };

    const scheduleType = form.watch('autoExport.scheduleType');
    const autoExportEnabled = form.watch('autoExport.enabled');
    const emailEnabled = form.watch('autoExport.email.enabled');
    const formats = form.watch('autoExport.formats');

    // Date Range Calculation
    const offsetFrom = form.watch('config.offsetFrom');
    const offsetTo = form.watch('config.offsetTo');
    const today = new Date();
    const fromDate = new Date();
    fromDate.setDate(today.getDate() - (offsetFrom || 0));
    const toDate = new Date();
    toDate.setDate(today.getDate() - (offsetTo || 0));
    const dateOptions: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' };

    // Calculate frequency text for display
    const getFrequencyText = () => {
        switch (scheduleType) {
            case 'daily':
                return 'Every day at midnight';
            case 'weekly': {
                const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                return `Every ${days[form.watch('autoExport.dayOfWeek')]}`;
            }
            case 'monthly': {
                const mode = form.watch('autoExport.monthMode');
                if (mode === 'last') return 'Last day of every month';
                if (mode === 'relative') {
                    const ordinals: Record<string, string> = { first: '1st', second: '2nd', third: '3rd', fourth: '4th', last: 'Last' };
                    const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][form.watch('autoExport.dayOfWeek')];
                    return `${ordinals[form.watch('autoExport.weekOrdinal') ?? 'first']} ${dayName} of every month`;
                }
                return `Day ${form.watch('autoExport.dayOfMonth')} of every month`;
            }
            case 'custom':
                return form.watch('autoExport.cron');
            default:
                return 'Not configured';
        }
    };

    // Check if configuration is incomplete
    const isConfigIncomplete = useMemo(() => {
        if (!autoExportEnabled) return false;
        // Check if formats are selected
        if (!formats || formats.length === 0) return true;
        return false;
    }, [autoExportEnabled, formats]);

    // Email feature availability
    const isEmailAvailable = emailConfigStatus?.enabled && emailConfigStatus?.configValid;

    // Recent exports for history
    const recentExports = useMemo(() => {
        if (!exportFiles) return [];
        return exportFiles.slice(0, 10); // Last 10 exports
    }, [exportFiles]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

                    {/* === STATUS BLOCK === */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Export Status
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {/* Status */}
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                                    <div className="flex items-center gap-2">
                                        {autoExportEnabled ? (
                                            isConfigIncomplete ? (
                                                <>
                                                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                                    <span className="text-sm font-medium text-yellow-600">Incomplete</span>
                                                </>
                                            ) : (
                                                <>
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    <span className="text-sm font-medium text-green-600">Active</span>
                                                </>
                                            )
                                        ) : (
                                            <>
                                                <XCircle className="h-4 w-4 text-muted-foreground" />
                                                <span className="text-sm font-medium text-muted-foreground">Disabled</span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Frequency */}
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Frequency</p>
                                    <p className="text-sm font-medium">
                                        {autoExportEnabled ? getFrequencyText() : '—'}
                                    </p>
                                </div>

                                {/* Next Run */}
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Next Run</p>
                                    <p className="text-sm font-medium">
                                        {exportJob?.nextRun ? new Date(exportJob.nextRun).toLocaleString() : '—'}
                                    </p>
                                </div>

                                {/* Delivery */}
                                <div className="space-y-1">
                                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Delivery</p>
                                    <div className="flex items-center gap-2">
                                        <Badge variant="outline" className="text-xs">
                                            <FolderOpen className="h-3 w-3 mr-1" />
                                            Server
                                        </Badge>
                                        {emailEnabled && isEmailAvailable && (
                                            <Badge variant="outline" className="text-xs">
                                                <Mail className="h-3 w-3 mr-1" />
                                                Email
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* === INCOMPLETE CONFIG WARNING === */}
                    {isConfigIncomplete && (
                        <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            <AlertTitle className="text-yellow-800 dark:text-yellow-200">Incomplete Configuration</AlertTitle>
                            <AlertDescription className="text-yellow-700 dark:text-yellow-300">
                                Automatic exports are enabled but the configuration is incomplete. Please select at least one export format.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* === MASTER SWITCH === */}
                    <FormField control={form.control} name="autoExport.enabled" render={({ field }) => (
                        <SettingsSection title="Automatic Exports">
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                                <div className="space-y-0.5">
                                    <FormLabel className="text-base">Enable Automatic Exports</FormLabel>
                                    <FormDescription>
                                        Automatically generate exports on a schedule
                                    </FormDescription>
                                </div>
                                <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                        </SettingsSection>
                    )} />

                    {/* === SCHEDULE (Progressive Disclosure) === */}
                    {autoExportEnabled && (
                        <SettingsSection title="Schedule" description="Configure when exports are generated">
                            <div className="space-y-6">
                                {/* Frequency Selection */}
                                <FormField control={form.control} name="autoExport.scheduleType" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Frequency</FormLabel>
                                        <FormControl>
                                            <RadioGroup onValueChange={field.onChange} value={field.value} className="grid grid-cols-4 gap-4">
                                                {[
                                                    { value: 'daily', label: 'Daily', icon: Calendar },
                                                    { value: 'weekly', label: 'Weekly', icon: Calendar },
                                                    { value: 'monthly', label: 'Monthly', icon: CalendarDays },
                                                    { value: 'custom', label: 'Custom', icon: Settings },
                                                ].map((option) => (
                                                    <FormItem key={option.value}>
                                                        <FormControl>
                                                            <label
                                                                className={cn(
                                                                    "flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground cursor-pointer transition-all",
                                                                    field.value === option.value && "border-primary bg-primary/5"
                                                                )}
                                                            >
                                                                <RadioGroupItem value={option.value} className="sr-only" />
                                                                <option.icon className={cn("h-5 w-5 mb-2", field.value === option.value ? "text-primary" : "text-muted-foreground")} />
                                                                <span className={cn("text-sm font-medium", field.value === option.value && "text-primary")}>{option.label}</span>
                                                            </label>
                                                        </FormControl>
                                                    </FormItem>
                                                ))}
                                            </RadioGroup>
                                        </FormControl>
                                    </FormItem>
                                )} />

                                {/* Weekly Options */}
                                {scheduleType === 'weekly' && (
                                    <FormField control={form.control} name="autoExport.dayOfWeek" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Day of Week</FormLabel>
                                            <Select onValueChange={(val) => field.onChange(parseInt(val))} value={String(field.value)}>
                                                <FormControl>
                                                    <SelectTrigger><SelectValue placeholder="Select day" /></SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="1">Monday</SelectItem>
                                                    <SelectItem value="2">Tuesday</SelectItem>
                                                    <SelectItem value="3">Wednesday</SelectItem>
                                                    <SelectItem value="4">Thursday</SelectItem>
                                                    <SelectItem value="5">Friday</SelectItem>
                                                    <SelectItem value="6">Saturday</SelectItem>
                                                    <SelectItem value="0">Sunday</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )} />
                                )}

                                {/* Monthly Options */}
                                {scheduleType === 'monthly' && (
                                    <div className="space-y-4">
                                        <FormField control={form.control} name="autoExport.monthMode" render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Mode</FormLabel>
                                                <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="specific" /></FormControl><FormLabel className="font-normal">Specific Day</FormLabel></FormItem>
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="relative" /></FormControl><FormLabel className="font-normal">Relative</FormLabel></FormItem>
                                                    <FormItem className="flex items-center space-x-2"><FormControl><RadioGroupItem value="last" /></FormControl><FormLabel className="font-normal">Last Day</FormLabel></FormItem>
                                                </RadioGroup>
                                            </FormItem>
                                        )} />

                                        {form.watch('autoExport.monthMode') === 'specific' && (
                                            <FormField control={form.control} name="autoExport.dayOfMonth" render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>Day of Month (1-31)</FormLabel>
                                                    <FormControl><Input type="number" min={1} max={31} {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl>
                                                </FormItem>
                                            )} />
                                        )}

                                        {form.watch('autoExport.monthMode') === 'relative' && (
                                            <div className="flex gap-4">
                                                <FormField control={form.control} name="autoExport.weekOrdinal" render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>Ordinal</FormLabel>
                                                        <Select onValueChange={field.onChange} value={field.value}>
                                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="first">First</SelectItem>
                                                                <SelectItem value="second">Second</SelectItem>
                                                                <SelectItem value="third">Third</SelectItem>
                                                                <SelectItem value="fourth">Fourth</SelectItem>
                                                                <SelectItem value="last">Last</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                                <FormField control={form.control} name="autoExport.dayOfWeek" render={({ field }) => (
                                                    <FormItem className="flex-1">
                                                        <FormLabel>Day</FormLabel>
                                                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={String(field.value)}>
                                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="1">Monday</SelectItem>
                                                                <SelectItem value="2">Tuesday</SelectItem>
                                                                <SelectItem value="3">Wednesday</SelectItem>
                                                                <SelectItem value="4">Thursday</SelectItem>
                                                                <SelectItem value="5">Friday</SelectItem>
                                                                <SelectItem value="6">Saturday</SelectItem>
                                                                <SelectItem value="0">Sunday</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </FormItem>
                                                )} />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Custom Cron */}
                                {scheduleType === 'custom' && (
                                    <FormField control={form.control} name="autoExport.cron" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Cron Expression</FormLabel>
                                            <FormControl><Input {...field} className="font-mono" placeholder="0 0 * * *" /></FormControl>
                                            <CronPreview expression={field.value} />
                                        </FormItem>
                                    )} />
                                )}

                                {/* Export Formats - Toggle Chips */}
                                <div className="space-y-3">
                                    <FormLabel className="text-base">Export Formats</FormLabel>
                                    <div className="flex gap-3">
                                        <FormField control={form.control} name="autoExport.formats" render={({ field }) => (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant={Array.isArray(field.value) && field.value.includes('csv') ? 'default' : 'outline'}
                                                    size="sm"
                                                    className={cn("gap-2 transition-all", Array.isArray(field.value) && field.value.includes('csv') && "bg-primary text-primary-foreground")}
                                                    onClick={() => {
                                                        const currentValue = Array.isArray(field.value) ? field.value : [];
                                                        field.onChange(
                                                            currentValue.includes('csv')
                                                                ? currentValue.filter((v) => v !== 'csv')
                                                                : [...currentValue, 'csv']
                                                        );
                                                    }}
                                                >
                                                    <FileText className="h-4 w-4" />
                                                    CSV
                                                    {Array.isArray(field.value) && field.value.includes('csv') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant={Array.isArray(field.value) && field.value.includes('pdf') ? 'default' : 'outline'}
                                                    size="sm"
                                                    className={cn("gap-2 transition-all", Array.isArray(field.value) && field.value.includes('pdf') && "bg-primary text-primary-foreground")}
                                                    onClick={() => {
                                                        const currentValue = Array.isArray(field.value) ? field.value : [];
                                                        field.onChange(
                                                            currentValue.includes('pdf')
                                                                ? currentValue.filter((v) => v !== 'pdf')
                                                                : [...currentValue, 'pdf']
                                                        );
                                                    }}
                                                >
                                                    <FileText className="h-4 w-4" />
                                                    PDF
                                                    {Array.isArray(field.value) && field.value.includes('pdf') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                </Button>
                                            </>
                                        )} />
                                    </div>
                                </div>
                            </div>
                        </SettingsSection>
                    )}

                    {/* === DATA RANGE === */}
                    <SettingsSection title="Data Range" description="Define the date range for exported data">
                        <div className="space-y-4">
                            {/* Range Mode Toggle */}
                            <div className="flex gap-2 mb-4">
                                <Button
                                    type="button"
                                    variant={rangeMode === 'rolling' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setRangeMode('rolling')}
                                >
                                    Rolling Window
                                </Button>
                                <Button
                                    type="button"
                                    variant={rangeMode === 'fixed' ? 'default' : 'outline'}
                                    size="sm"
                                    onClick={() => setRangeMode('fixed')}
                                >
                                    Custom Days
                                </Button>
                            </div>

                            {rangeMode === 'rolling' ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="config.offsetFrom" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Period</FormLabel>
                                            <Select onValueChange={(val) => {
                                                const days = parseInt(val);
                                                field.onChange(days);
                                                form.setValue('config.offsetTo', 0);
                                            }} value={String(field.value)}>
                                                <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                                <SelectContent>
                                                    <SelectItem value="7">Last 7 days</SelectItem>
                                                    <SelectItem value="14">Last 14 days</SelectItem>
                                                    <SelectItem value="30">Last 30 days</SelectItem>
                                                    <SelectItem value="60">Last 60 days</SelectItem>
                                                    <SelectItem value="90">Last 90 days</SelectItem>
                                                    <SelectItem value="180">Last 6 months</SelectItem>
                                                    <SelectItem value="365">Last 12 months</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </FormItem>
                                    )} />
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    <FormField control={form.control} name="config.offsetFrom" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>From (days ago)</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                    <FormField control={form.control} name="config.offsetTo" render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>To (days ago)</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={0} {...field} onChange={e => field.onChange(parseInt(e.target.value) || 0)} />
                                            </FormControl>
                                        </FormItem>
                                    )} />
                                </div>
                            )}

                            {/* Date Preview */}
                            <div className="p-4 bg-muted/50 rounded-lg border">
                                <div className="flex items-center gap-2 text-sm mb-2">
                                    <Info className="h-4 w-4 text-blue-500" />
                                    <span className="font-medium">Preview Range</span>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    <strong>{fromDate.toLocaleDateString(undefined, dateOptions)}</strong>
                                    {' → '}
                                    <strong>{toDate.toLocaleDateString(undefined, dateOptions)}</strong>
                                    <span className="ml-2 text-xs">({Intl.DateTimeFormat().resolvedOptions().timeZone})</span>
                                </p>
                            </div>
                        </div>
                    </SettingsSection>

                    {/* === DESTINATION === */}
                    <SettingsSection title="Destination" description="Where exports are stored on the server">
                        <div className="space-y-4">
                            <FormField control={form.control} name="config.path" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Export Directory</FormLabel>
                                    <FormControl>
                                        <div className="flex gap-2">
                                            <div className="flex-1 relative">
                                                <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                                <Input {...field} className="pl-10 font-mono text-sm" />
                                            </div>
                                        </div>
                                    </FormControl>
                                    <FormDescription>
                                        Path on the server filesystem. Files are stored here and accessible via the download API.
                                    </FormDescription>
                                </FormItem>
                            )} />
                        </div>
                    </SettingsSection>

                    {/* === EMAIL DELIVERY (Feature-Gated) === */}
                    <SettingsSection title="Email Delivery" description="Send exports via email">
                        {!emailConfigStatus?.enabled ? (
                            <Alert>
                                <Mail className="h-4 w-4" />
                                <AlertTitle>Email Feature Disabled</AlertTitle>
                                <AlertDescription>
                                    Enable the email feature in Email Settings to send exports by email.
                                </AlertDescription>
                            </Alert>
                        ) : !emailConfigStatus?.configValid ? (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Email Not Configured</AlertTitle>
                                <AlertDescription>
                                    Email is enabled but not properly configured. Please configure your email provider in Email Settings.
                                </AlertDescription>
                            </Alert>
                        ) : (
                            <>
                                <FormField control={form.control} name="autoExport.email.enabled" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 mb-4">
                                        <div className="space-y-0.5">
                                            <FormLabel className="text-base">Enable Email Delivery</FormLabel>
                                            <FormDescription>Send exports as email attachments</FormDescription>
                                        </div>
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    </FormItem>
                                )} />

                                {emailEnabled && (
                                    <div className="space-y-4 pt-4 border-t">
                                        {/* Email Formats */}
                                        <div className="space-y-3">
                                            <FormLabel>Email Attachments</FormLabel>
                                            <div className="flex gap-3">
                                                <FormField control={form.control} name="autoExport.email.formats" render={({ field }) => (
                                                    <>
                                                        <Button
                                                            type="button"
                                                            variant={Array.isArray(field.value) && field.value.includes('csv') ? 'default' : 'outline'}
                                                            size="sm"
                                                            className={cn("gap-2", Array.isArray(field.value) && field.value.includes('csv') && "bg-primary text-primary-foreground")}
                                                            onClick={() => {
                                                                const currentValue = Array.isArray(field.value) ? field.value : [];
                                                                field.onChange(
                                                                    currentValue.includes('csv')
                                                                        ? currentValue.filter((v) => v !== 'csv')
                                                                        : [...currentValue, 'csv']
                                                                );
                                                            }}
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                            CSV
                                                            {Array.isArray(field.value) && field.value.includes('csv') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                        </Button>
                                                        <Button
                                                            type="button"
                                                            variant={Array.isArray(field.value) && field.value.includes('pdf') ? 'default' : 'outline'}
                                                            size="sm"
                                                            className={cn("gap-2", Array.isArray(field.value) && field.value.includes('pdf') && "bg-primary text-primary-foreground")}
                                                            onClick={() => {
                                                                const currentValue = Array.isArray(field.value) ? field.value : [];
                                                                field.onChange(
                                                                    currentValue.includes('pdf')
                                                                        ? currentValue.filter((v) => v !== 'pdf')
                                                                        : [...currentValue, 'pdf']
                                                                );
                                                            }}
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                            PDF
                                                            {Array.isArray(field.value) && field.value.includes('pdf') && <CheckCircle2 className="h-3.5 w-3.5" />}
                                                        </Button>
                                                    </>
                                                )} />
                                            </div>
                                        </div>

                                        {/* Recipients */}
                                        <div className="space-y-2">
                                            <FormLabel>Recipients</FormLabel>
                                            <RecipientSelector
                                                recipients={form.watch('autoExport.email.recipients')}
                                                setRecipients={(vals) => {
                                                    const current = form.getValues('autoExport.email.recipients');
                                                    const next = typeof vals === 'function' ? vals(current) : vals;
                                                    form.setValue('autoExport.email.recipients', next);
                                                }}
                                                customEmails={form.watch('autoExport.email.customEmails').join(',')}
                                                setCustomEmails={(val) => {
                                                    const current = form.getValues('autoExport.email.customEmails').join(',');
                                                    const next = typeof val === 'function' ? val(current) : val;
                                                    form.setValue('autoExport.email.customEmails', next.split(',').filter(Boolean));
                                                }}
                                                label=""
                                            />
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </SettingsSection>

                    {/* === RETENTION & CLEANUP === */}
                    <SettingsSection title="Retention & Cleanup" description="Automatically remove old export files">
                        <div className="space-y-4">
                            <div className="flex gap-4 items-end">
                                <FormField control={form.control} name="retention.days" render={({ field }) => (
                                    <FormItem className="flex-1">
                                        <FormLabel>Retention Period</FormLabel>
                                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={String(field.value)}>
                                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                                            <SelectContent>
                                                <SelectItem value="0">Never (Keep Forever)</SelectItem>
                                                <SelectItem value="30">30 Days</SelectItem>
                                                <SelectItem value="60">60 Days</SelectItem>
                                                <SelectItem value="90">90 Days</SelectItem>
                                                <SelectItem value="180">180 Days (6 Months)</SelectItem>
                                                <SelectItem value="365">365 Days (1 Year)</SelectItem>
                                                <SelectItem value="3650">10 Years</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormDescription>
                                            Files older than this will be automatically deleted during cleanup.
                                        </FormDescription>
                                    </FormItem>
                                )} />
                            </div>

                            {/* Cleanup Now with Confirmation */}
                            <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                                <div>
                                    <p className="font-medium text-sm">Manual Cleanup</p>
                                    <p className="text-xs text-muted-foreground">
                                        Delete all exports older than the retention period ({form.watch('retention.days')} days)
                                    </p>
                                </div>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button type="button" variant="outline" size="sm" disabled={isCleaning}>
                                            {isCleaning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                            Cleanup Now
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Confirm Cleanup</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                This will permanently delete all export files older than {form.watch('retention.days')} days. This action cannot be undone.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                                            <AlertDialogAction onClick={handleCleanup} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                                Delete Old Files
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        </div>
                    </SettingsSection>

                    {/* === RUN NOW (Actions) === */}
                    <SettingsSection title="Manual Actions" description="Generate exports or test email delivery">
                        <div className="space-y-4">
                            {/* Run Now with Draft Warning */}
                            <div className="flex items-center justify-between p-4 border rounded-lg">
                                <div>
                                    <p className="font-medium text-sm">Generate Export Now</p>
                                    <p className="text-xs text-muted-foreground">
                                        Run the export immediately with {isDirty ? 'current (unsaved)' : 'saved'} configuration
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {isDirty && (
                                        <Badge variant="outline" className="text-yellow-600 border-yellow-300 bg-yellow-50">
                                            <AlertTriangle className="h-3 w-3 mr-1" />
                                            Unsaved
                                        </Badge>
                                    )}
                                    <Button type="button" onClick={handleRunNow} disabled={isRunningNow}>
                                        {isRunningNow ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                                        Run Now
                                    </Button>
                                </div>
                            </div>

                            {/* Test Email */}
                            {isEmailAvailable && emailEnabled && (
                                <div className="flex items-center justify-between p-4 border rounded-lg">
                                    <div>
                                        <p className="font-medium text-sm">Test Email Delivery</p>
                                        <p className="text-xs text-muted-foreground">
                                            Send a test email to verify delivery configuration
                                        </p>
                                    </div>
                                    <Button type="button" variant="secondary" onClick={handleTestEmail} disabled={isTesting}>
                                        {isTesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                                        Test Email
                                    </Button>
                                </div>
                            )}
                        </div>
                    </SettingsSection>

                    {/* === RUN HISTORY === */}
                    <SettingsSection title="Export History" description="Recent export files">
                        {recentExports.length === 0 ? (
                            <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                                <History className="h-8 w-8 mb-2" />
                                <p className="text-sm">No exports yet</p>
                                <p className="text-xs">Generated exports will appear here</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Filename</TableHead>
                                            <TableHead>Size</TableHead>
                                            <TableHead>Created</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {recentExports.map((file, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-mono text-sm">{file.filename}</TableCell>
                                                <TableCell className="text-muted-foreground">{formatFileSize(file.size)}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {file.createdAt ? new Date(file.createdAt).toLocaleString() : '—'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        asChild
                                                    >
                                                        <a href={exportApi.getDownloadUrl(file.filename)} download>
                                                            <Download className="h-4 w-4" />
                                                        </a>
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                                <div className="flex justify-end">
                                    <Button type="button" variant="ghost" size="sm" onClick={() => refetchExports()}>
                                        <RefreshCw className="h-4 w-4 mr-2" />
                                        Refresh
                                    </Button>
                                </div>
                            </div>
                        )}
                    </SettingsSection>

                    {/* === SAVE BUTTON === */}
                    <div className="flex justify-end pt-6 border-t">
                        <div className="flex items-center gap-4">
                            {isDirty && (
                                <span className="text-sm text-muted-foreground">
                                    You have unsaved changes
                                </span>
                            )}
                            <Button type="submit" disabled={isUpdating}>
                                {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Save Changes
                            </Button>
                        </div>
                    </div>
                </form>
            </Form>
        </div>
    );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
