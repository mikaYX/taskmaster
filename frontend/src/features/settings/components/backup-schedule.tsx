
import type { UseFormReturn } from 'react-hook-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Lock } from 'lucide-react';

interface BackupScheduleProps {
    form: UseFormReturn<any>;
}

export function BackupSchedule({ form }: BackupScheduleProps) {
    const isEnabled = form.watch('enabled');
    const scheduleType = form.watch('scheduleType');

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="space-y-1">
                    <CardTitle>Automatic Backup Schedule</CardTitle>
                    <CardDescription>Configure frequency and retention settings</CardDescription>
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
                            <h4 className="text-sm font-medium">Frequency</h4>
                            <FormField control={form.control} name="scheduleType" render={({ field }) => (
                                <FormItem>
                                    <FormControl>
                                        <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-col space-y-2">
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl><RadioGroupItem value="daily" /></FormControl>
                                                <FormLabel className="font-normal">Daily</FormLabel>
                                            </FormItem>
                                            <FormItem className="flex items-center space-x-3 space-y-0">
                                                <FormControl><RadioGroupItem value="weekly" /></FormControl>
                                                <FormLabel className="font-normal">Weekly</FormLabel>
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

                            <FormField control={form.control} name="time" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Time (HH:mm)</FormLabel>
                                    <FormControl>
                                        <Input type="time" {...field} className="w-full" />
                                    </FormControl>
                                </FormItem>
                            )} />
                        </div>

                        {/* RETENTION & DELIVERY */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-medium">Retention Policy</h4>
                            <FormField control={form.control} name="retention.count" render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Keep last {field.value} files</FormLabel>
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
                                    <FormDescription>Older backups are automatically deleted.</FormDescription>
                                </FormItem>
                            )} />

                        </div>
                    </div>

                    <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-4 border border-blue-200 dark:border-blue-900/50">
                        <Lock className="h-5 w-5 text-blue-500 mt-0.5" />
                        <div className="space-y-1">
                            <h5 className="text-sm font-medium">Encryption is Enabled</h5>
                            <p className="text-xs text-muted-foreground">
                                All automatic backups are encrypted using the server-side key (`BACKUP_ENCRYPTION_KEY`).
                                You do not need to manage passwords manually for scheduled jobs.
                            </p>
                        </div>
                    </div>
                </CardContent>
            )}
        </Card>
    );
}
