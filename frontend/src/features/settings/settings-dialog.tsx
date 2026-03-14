import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Database, FileDown, Settings, Clock } from 'lucide-react';

interface SettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Settings Dialog.
 * 
 * Tabbed interface for managing application settings.
 * shadcn/ui Dialog + Tabs.
 */
export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Settings</DialogTitle>
                    <DialogDescription>
                        Manage application configuration
                    </DialogDescription>
                </DialogHeader>

                <Tabs defaultValue="email" className="mt-4">
                    <TabsList className="grid w-full grid-cols-5">
                        <TabsTrigger value="email" className="flex items-center gap-1">
                            <Mail className="h-4 w-4" />
                            <span className="hidden sm:inline">Email</span>
                        </TabsTrigger>
                        <TabsTrigger value="backup" className="flex items-center gap-1">
                            <Database className="h-4 w-4" />
                            <span className="hidden sm:inline">Backup</span>
                        </TabsTrigger>
                        <TabsTrigger value="export" className="flex items-center gap-1">
                            <FileDown className="h-4 w-4" />
                            <span className="hidden sm:inline">Export</span>
                        </TabsTrigger>
                        <TabsTrigger value="scheduler" className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            <span className="hidden sm:inline">Scheduler</span>
                        </TabsTrigger>
                        <TabsTrigger value="general" className="flex items-center gap-1">
                            <Settings className="h-4 w-4" />
                            <span className="hidden sm:inline">General</span>
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="email" className="mt-4">
                        <EmailSettings />
                    </TabsContent>

                    <TabsContent value="backup" className="mt-4">
                        <BackupSettings />
                    </TabsContent>

                    <TabsContent value="export" className="mt-4">
                        <ExportSettings />
                    </TabsContent>

                    <TabsContent value="scheduler" className="mt-4">
                        <SchedulerSettings />
                    </TabsContent>

                    <TabsContent value="general" className="mt-4">
                        <GeneralSettings />
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog>
    );
}

/**
 * Email Settings Tab.
 */
function EmailSettings() {
    const [provider, setProvider] = useState('smtp');
    const [enabled, setEnabled] = useState(false);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Email Notifications</p>
                    <p className="text-sm text-muted-foreground">Enable email sending</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {enabled && (
                <>
                    <div className="space-y-2">
                        <Label>Provider</Label>
                        <Select value={provider} onValueChange={setProvider}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="smtp">SMTP</SelectItem>
                                <SelectItem value="mailgun">Mailgun</SelectItem>
                                <SelectItem value="sendgrid">SendGrid</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {provider === 'smtp' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Host</Label>
                                <Input placeholder="smtp.example.com" />
                            </div>
                            <div className="space-y-2">
                                <Label>Port</Label>
                                <Input placeholder="587" />
                            </div>
                            <div className="space-y-2">
                                <Label>Username</Label>
                                <Input />
                            </div>
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <Input type="password" placeholder="••••••••" />
                            </div>
                        </div>
                    )}

                    <Button variant="outline" className="w-full">Test Connection</Button>
                </>
            )}

            <Button className="w-full">Save Changes</Button>
        </div>
    );
}

/**
 * Backup Settings Tab.
 */
function BackupSettings() {
    const [retention, setRetention] = useState('30');

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Backup Retention (days)</Label>
                <Select value={retention} onValueChange={setRetention}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                        <SelectItem value="30">30 days</SelectItem>
                        <SelectItem value="60">60 days</SelectItem>
                        <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="flex gap-2">
                <Button variant="outline" className="flex-1">Create Backup Now</Button>
                <Button variant="outline" className="flex-1">Cleanup Expired</Button>
            </div>

            <Button className="w-full">Save Changes</Button>
        </div>
    );
}

/**
 * Export Settings Tab.
 */
function ExportSettings() {
    const [retention, setRetention] = useState('7');

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Export Retention (days)</Label>
                <Select value={retention} onValueChange={setRetention}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1 day</SelectItem>
                        <SelectItem value="3">3 days</SelectItem>
                        <SelectItem value="7">7 days</SelectItem>
                        <SelectItem value="14">14 days</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Button variant="outline" className="w-full">Cleanup Expired Exports</Button>
            <Button className="w-full">Save Changes</Button>
        </div>
    );
}

/**
 * Scheduler Settings Tab.
 */
function SchedulerSettings() {
    const [enabled, setEnabled] = useState(true);

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="font-medium">Scheduler</p>
                    <p className="text-sm text-muted-foreground">Enable scheduled jobs</p>
                </div>
                <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {enabled && (
                <div className="space-y-2">
                    <p className="text-sm font-medium">Active Jobs:</p>
                    <div className="space-y-1 text-sm text-muted-foreground">
                        <p>• Cleanup Exports - Daily 2:00 AM</p>
                        <p>• Cleanup Backups - Daily 3:00 AM</p>
                        <p>• Health Check - Every 5 minutes</p>
                    </div>
                </div>
            )}

            <Button className="w-full">Save Changes</Button>
        </div>
    );
}

/**
 * General Settings Tab.
 */
function GeneralSettings() {
    const [timezone, setTimezone] = useState('Europe/Paris');

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Default Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                        <SelectItem value="Europe/London">Europe/London</SelectItem>
                        <SelectItem value="America/New_York">America/New_York</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <Button className="w-full">Save Changes</Button>
        </div>
    );
}
