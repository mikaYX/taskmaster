
import type { UseFormReturn } from 'react-hook-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface BackupScheduleProps {
    form: UseFormReturn<any>;
}

export function BackupSchedule({ form }: BackupScheduleProps) {
    const { t } = useTranslation();
    const isEnabled = form.watch('enabled');
    const scheduleType = form.watch('scheduleType');

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>{t('backupSchedule.title')}</CardTitle>
                    <CardDescription>{t('backupSchedule.description')}</CardDescription>
                </div>
                <FormField control={form.control} name="enabled" render={({ field }) => (
                    <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                )} />
            </CardHeader>
            {isEnabled && (
                <CardContent className="space-y-6 pt-6">
                    <div className="grid gap-6 md:grid-cols-2">
                        {/* FREQUENCY */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium">{t('backupSchedule.frequency')}</h4>
                            <FormField control={form.control} name="scheduleType" render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-2">
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl><RadioGroupItem value="daily" /></FormControl>
                                                <FormLabel className="font-normal">{t('backupSchedule.daily')}</FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl><RadioGroupItem value="weekly" /></FormControl>
                                                <FormLabel className="font-normal">{t('backupSchedule.weekly')}</FormLabel>
                                            </FormItem>
                                        </RadioGroup>
                                    </FormControl>
                                </FormItem>
                            )} />

                            {scheduleType === 'weekly' && (
                                <FormField control={form.control} name="dayOfWeek" render={({ field }) => (
                                    <FormItem>
                                        <Select onValueChange={(val) => field.onChange(parseInt(val))} value={String(field.value)}>
                                            <FormControl>
                                                <SelectTrigger><SelectValue placeholder={t('backupSchedule.selectDay')} /></SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="1">{t('backupSchedule.days.monday')}</SelectItem>
                                                <SelectItem value="2">{t('backupSchedule.days.tuesday')}</SelectItem>
                                                <SelectItem value="3">{t('backupSchedule.days.wednesday')}</SelectItem>
                                                <SelectItem value="4">{t('backupSchedule.days.thursday')}</SelectItem>
                                                <SelectItem value="5">{t('backupSchedule.days.friday')}</SelectItem>
                                                <SelectItem value="6">{t('backupSchedule.days.saturday')}</SelectItem>
                                                <SelectItem value="0">{t('backupSchedule.days.sunday')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </FormItem>
                                )} />
                            )}

                            <FormField control={form.control} name="time" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('backupSchedule.timeLabel')}</FormLabel>
                                    <FormControl>
                                        <Input type="time" {...field} className="w-full" />
                                    </FormControl>
                                </FormItem>
                            )} />
                        </div>

                        {/* RETENTION & DELIVERY */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium">{t('backupSchedule.retentionPolicy')}</h4>
                            <FormField control={form.control} name="retention.count" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('backupSchedule.keepLastFiles', { count: field.value })}</FormLabel>
                                    <FormControl>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="range"
                                                min="1" max="50"
                                                value={field.value}
                                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                                                className="flex-1 accent-primary h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                                            />
                                            <span className="font-mono border px-2 py-1 rounded text-sm min-w-[3rem] text-center">{field.value}</span>
                                        </div>
                                    </FormControl>
                                    <FormDescription>{t('backupSchedule.retentionDescription')}</FormDescription>
                                </FormItem>
                            )} />

                        </div>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-4 border border-blue-200 dark:border-blue-900/50">
                        <Lock className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="space-y-1">
                            <h5 className="text-sm font-medium">{t('backupSchedule.encryptionEnabled')}</h5>
                            <p className="text-xs text-muted-foreground">
                                {t('backupSchedule.encryptionEnabledDescription')}
                            </p>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
