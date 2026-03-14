import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSection } from '../components/settings-section';
import { useSettings } from '../hooks/use-settings';
import { emailSettingsSchema } from '../schemas/settings-schemas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Mail } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";

export function EmailSettingsPage() {
    const { settings, getSetting, updateSetting, isLoading, isUpdating, testEmail, isTestingEmail } = useSettings();
    const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
    const [testEmailTo, setTestEmailTo] = useState('');
    const isInitialized = useRef(false);

    const form = useForm({
        resolver: zodResolver(emailSettingsSchema),
        defaultValues: {
            enabled: false,
            provider: 'smtp' as 'smtp' | 'mailgun' | 'mailjet' | 'sendgrid',
            smtp: { host: '', port: 587, user: '', pass: '', from: '', secure: false },
            mailgun: { apiKey: '', domain: '', region: 'us', from: '' },
            mailjet: { apiKey: '', secretKey: '', from: '' },
            sendgrid: { apiKey: '', from: '' },
            alerts: { missingTasks: false, recipients: [] as string[], customEmails: [] as string[] },
            reminders: { enabled: false, offsetHours: 1, offsetMinutes: 0, recipients: [] as string[], customEmails: [] as string[] },
        },
    });

    // Helper to parse boolean settings
    const toBool = (val: unknown) => val === true || val === 'true';

    // Load settings
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            isInitialized.current = true;
            form.reset({
                enabled: toBool(getSetting('email.enabled')),
                provider: (getSetting('email.provider') as any) || 'smtp',
                smtp: {
                    host: getSetting('email.smtp.host') || '',
                    port: parseInt(getSetting('email.smtp.port') || '587'),
                    user: getSetting('email.smtp.user') || '',
                    pass: getSetting('email.smtp.password') || '',
                    from: getSetting('email.from') || '',
                    secure: toBool(getSetting('email.smtp.secure')),
                },
                mailgun: {
                    apiKey: getSetting('email.mailgun.apiKey') || '',
                    domain: getSetting('email.mailgun.domain') || '',
                    region: 'us',
                    from: getSetting('email.from') || '',
                },
                mailjet: {
                    apiKey: getSetting('email.mailjet.apiKey') || '',
                    secretKey: getSetting('email.mailjet.secretKey') || '',
                    from: getSetting('email.from') || '',
                },
                sendgrid: {
                    apiKey: getSetting('email.sendgrid.apiKey') || '',
                    from: getSetting('email.from') || '',
                },
                // alerts / reminders : gérés dans l’onglet Notifications (valeurs par défaut, non persistées depuis cette page)
                alerts: { missingTasks: false, recipients: [] as string[], customEmails: [] as string[] },
                reminders: { enabled: false, offsetHours: 1, offsetMinutes: 0, recipients: [] as string[], customEmails: [] as string[] },
            });
            setTestEmailTo(getSetting('email.recipients') || '');
        }
    }, [settings.length]);



    const onSubmit = (data: any) => {
        // Global
        updateSetting({ key: 'email.enabled', value: data.enabled });
        updateSetting({ key: 'email.provider', value: data.provider });

        let fromAddress = '';
        if (data.provider === 'smtp') fromAddress = data.smtp?.from;
        else if (data.provider === 'mailgun') fromAddress = data.mailgun?.from;
        else if (data.provider === 'mailjet') fromAddress = data.mailjet?.from;
        else if (data.provider === 'sendgrid') fromAddress = data.sendgrid?.from;

        updateSetting({ key: 'email.from', value: fromAddress || '' });

        // Provider specific
        if (data.provider === 'smtp') {
            updateSetting({ key: 'email.smtp.host', value: data.smtp.host });
            updateSetting({ key: 'email.smtp.port', value: data.smtp.port });
            updateSetting({ key: 'email.smtp.user', value: data.smtp.user });
            updateSetting({ key: 'email.smtp.password', value: data.smtp.pass });
        } else if (data.provider === 'mailgun') {
            updateSetting({ key: 'email.mailgun.apiKey', value: data.mailgun.apiKey });
            updateSetting({ key: 'email.mailgun.domain', value: data.mailgun.domain });
        } else if (data.provider === 'mailjet') {
            updateSetting({ key: 'email.mailjet.apiKey', value: data.mailjet.apiKey });
            updateSetting({ key: 'email.mailjet.secretKey', value: data.mailjet.secretKey });
        } else if (data.provider === 'sendgrid') {
            updateSetting({ key: 'email.sendgrid.apiKey', value: data.sendgrid.apiKey });
        }

        // alerts / reminders : gérés dans l’onglet Notifications, pas sauvegardés ici

        // Reset form dirty state with new values
        form.reset(data);
    };

    const handleTestConnection = () => {
        // Check if config is saved before testing
        if (form.formState.isDirty) {
            toast.error("Veuillez sauvegarder vos paramètres avant de tester la connexion.");
            return;
        }
        testEmail({ to: [testEmailTo] });
    };

    if (isLoading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin" /></div>;

    return (
        <div className="space-y-6 max-w-6xl">

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                    {/* Enable Email */}
                    <SettingsSection title="Global Configuration">
                        <FormField
                            control={form.control}
                            name="enabled"
                            render={({ field }) => (
                                <FormItem className="flex flex-row items-center gap-3">
                                    <FormControl>
                                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                                    </FormControl>
                                    <div className="space-y-0.5">
                                        <FormLabel className="text-base">Enable Email Sending</FormLabel>
                                        <FormDescription>Master switch for all email features</FormDescription>
                                    </div>
                                </FormItem>
                            )}
                        />
                    </SettingsSection>

                    {form.watch('enabled') && (
                        <>
                            {/* Provider */}
                            <SettingsSection title="Email Provider">
                                <FormField
                                    control={form.control}
                                    name="provider"
                                    render={({ field }) => (
                                        <FormItem className="space-y-3">
                                            <FormControl>
                                                <RadioGroup
                                                    onValueChange={field.onChange}
                                                    value={field.value}
                                                    className="grid gap-3"
                                                >
                                                    <FormItem>
                                                        <FormControl>
                                                            <div>
                                                                <RadioGroupItem value="smtp" id="provider-smtp" className="peer sr-only" />
                                                                <Label
                                                                    htmlFor="provider-smtp"
                                                                    className="flex items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                                                >
                                                                    <span className="font-medium">SMTP</span>
                                                                </Label>
                                                            </div>
                                                        </FormControl>
                                                    </FormItem>
                                                    <FormItem>
                                                        <FormControl>
                                                            <div>
                                                                <RadioGroupItem value="mailgun" id="provider-mailgun" className="peer sr-only" />
                                                                <Label
                                                                    htmlFor="provider-mailgun"
                                                                    className="flex items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                                                >
                                                                    <span className="font-medium">Mailgun</span>
                                                                </Label>
                                                            </div>
                                                        </FormControl>
                                                    </FormItem>
                                                    <FormItem>
                                                        <FormControl>
                                                            <div>
                                                                <RadioGroupItem value="mailjet" id="provider-mailjet" className="peer sr-only" />
                                                                <Label
                                                                    htmlFor="provider-mailjet"
                                                                    className="flex items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                                                >
                                                                    <span className="font-medium">Mailjet</span>
                                                                </Label>
                                                            </div>
                                                        </FormControl>
                                                    </FormItem>
                                                    <FormItem>
                                                        <FormControl>
                                                            <div>
                                                                <RadioGroupItem value="sendgrid" id="provider-sendgrid" className="peer sr-only" />
                                                                <Label
                                                                    htmlFor="provider-sendgrid"
                                                                    className="flex items-center justify-between rounded-lg border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                                                                >
                                                                    <span className="font-medium">SendGrid</span>
                                                                </Label>
                                                            </div>
                                                        </FormControl>
                                                    </FormItem>
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </SettingsSection>

                            {/* SMTP Config */}
                            {form.watch('provider') === 'smtp' && (
                                <SettingsSection title="SMTP Configuration">
                                    <div className="grid grid-cols-2 gap-4">
                                        <FormField control={form.control} name="smtp.host" render={({ field }) => (
                                            <FormItem><FormLabel>Host</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="smtp.port" render={({ field }) => (
                                            <FormItem><FormLabel>Port</FormLabel><FormControl><Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="smtp.user" render={({ field }) => (
                                            <FormItem><FormLabel>User</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="smtp.pass" render={({ field }) => (
                                            <FormItem><FormLabel>Password</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="smtp.from" render={({ field }) => (
                                            <FormItem><FormLabel>From Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setIsTestDialogOpen(true)}>
                                        <Mail className="mr-2 h-4 w-4" /> Test Connection
                                    </Button>
                                </SettingsSection>
                            )}

                            {/* Mailgun Config */}
                            {form.watch('provider') === 'mailgun' && (
                                <SettingsSection title="Mailgun Configuration">
                                    <div className="grid gap-4">
                                        <FormField control={form.control} name="mailgun.apiKey" render={({ field }) => (
                                            <FormItem><FormLabel>API Key</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="mailgun.domain" render={({ field }) => (
                                            <FormItem><FormLabel>Domain</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="mailgun.from" render={({ field }) => (
                                            <FormItem><FormLabel>From Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setIsTestDialogOpen(true)}>
                                        <Mail className="mr-2 h-4 w-4" /> Test Connection
                                    </Button>
                                </SettingsSection>
                            )}

                            {/* Mailjet Config */}
                            {form.watch('provider') === 'mailjet' && (
                                <SettingsSection title="Mailjet Configuration">
                                    <div className="grid gap-4">
                                        <FormField control={form.control} name="mailjet.apiKey" render={({ field }) => (
                                            <FormItem><FormLabel>API Key</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="mailjet.secretKey" render={({ field }) => (
                                            <FormItem><FormLabel>Secret Key</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="mailjet.from" render={({ field }) => (
                                            <FormItem><FormLabel>From Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setIsTestDialogOpen(true)}>
                                        <Mail className="mr-2 h-4 w-4" /> Test Connection
                                    </Button>
                                </SettingsSection>
                            )}

                            {/* SendGrid Config */}
                            {form.watch('provider') === 'sendgrid' && (
                                <SettingsSection title="SendGrid Configuration">
                                    <div className="grid gap-4">
                                        <FormField control={form.control} name="sendgrid.apiKey" render={({ field }) => (
                                            <FormItem><FormLabel>API Key</FormLabel><FormControl><Input type="password" {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                        <FormField control={form.control} name="sendgrid.from" render={({ field }) => (
                                            <FormItem><FormLabel>From Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                                        )} />
                                    </div>
                                    <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setIsTestDialogOpen(true)}>
                                        <Mail className="mr-2 h-4 w-4" /> Test Connection
                                    </Button>
                                </SettingsSection>
                            )}
                        </>
                    )}

                    <div className="flex justify-end">
                        <Button type="submit" disabled={isUpdating}>
                            {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Changes
                        </Button>
                    </div>
                </form>
            </Form>

            <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Test Email</DialogTitle>
                        <DialogDescription>Send a test email to verify config.</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="test-email" className="text-right">Recipient</Label>
                            <Input
                                id="test-email"
                                value={testEmailTo}
                                onChange={(e) => setTestEmailTo(e.target.value)}
                                className="col-span-3"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleTestConnection} disabled={isTestingEmail}>
                            {isTestingEmail && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Send Test
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
