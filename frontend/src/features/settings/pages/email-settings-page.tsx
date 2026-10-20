import { useEffect, useState, useRef } from 'react';
import { toast } from 'sonner';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { SettingsSection } from '../components/settings-section';
import { useSettings } from '../hooks/use-settings';
import { emailSettingsSchema } from '../schemas/settings-schemas';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Mail, Power, Server, KeyRound, Send, Check, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
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
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

export function EmailSettingsPage() {
    const { t } = useTranslation();
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
    const emailEnabled = useWatch({ control: form.control, name: 'enabled' });
    const emailProvider = useWatch({ control: form.control, name: 'provider' });

    // Helper to parse boolean settings
    const toBool = (val: unknown) => val === true || val === 'true';

    // Load settings
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            isInitialized.current = true;
            form.reset({
                enabled: toBool(getSetting('email.enabled')),
                provider: (getSetting('email.provider') as 'smtp' | 'mailgun' | 'mailjet' | 'sendgrid') || 'smtp',
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
    }, [form, getSetting, settings.length]);



    const onSubmit = (data: z.infer<typeof emailSettingsSchema>) => {
        // Global
        updateSetting({ key: 'email.enabled', value: data.enabled });
        updateSetting({ key: 'email.provider', value: data.provider });

        let fromAddress = '';
        if (data.provider === 'smtp') fromAddress = data.smtp?.from ?? '';
        else if (data.provider === 'mailgun') fromAddress = data.mailgun?.from ?? '';
        else if (data.provider === 'mailjet') fromAddress = data.mailjet?.from ?? '';
        else if (data.provider === 'sendgrid') fromAddress = data.sendgrid?.from ?? '';

        updateSetting({ key: 'email.from', value: fromAddress || '' });

        // Provider specific
        if (data.provider === 'smtp') {
            updateSetting({ key: 'email.smtp.host', value: data.smtp?.host ?? '' });
            updateSetting({ key: 'email.smtp.port', value: data.smtp?.port ?? 587 });
            updateSetting({ key: 'email.smtp.user', value: data.smtp?.user ?? '' });
            updateSetting({ key: 'email.smtp.password', value: data.smtp?.pass ?? '' });
        } else if (data.provider === 'mailgun') {
            updateSetting({ key: 'email.mailgun.apiKey', value: data.mailgun?.apiKey ?? '' });
            updateSetting({ key: 'email.mailgun.domain', value: data.mailgun?.domain ?? '' });
        } else if (data.provider === 'mailjet') {
            updateSetting({ key: 'email.mailjet.apiKey', value: data.mailjet?.apiKey ?? '' });
            updateSetting({ key: 'email.mailjet.secretKey', value: data.mailjet?.secretKey ?? '' });
        } else if (data.provider === 'sendgrid') {
            updateSetting({ key: 'email.sendgrid.apiKey', value: data.sendgrid?.apiKey ?? '' });
        }

        // alerts / reminders : gérés dans l’onglet Notifications, pas sauvegardés ici

        // Reset form dirty state with new values
        form.reset(data);
    };

    const handleTestConnection = () => {
        // Check if config is saved before testing
        if (form.formState.isDirty) {
            toast.error(t('emailSettings.saveBeforeTest'));
            return;
        }
        testEmail({ to: [testEmailTo] });
    };

    if (isLoading) return <div className="flex justify-center h-64 items-center"><Loader2 className="animate-spin" /></div>;

    const providers = [
        { id: 'smtp', name: 'SMTP', icon: Server },
        { id: 'mailgun', name: 'Mailgun', icon: Send },
        { id: 'mailjet', name: 'Mailjet', icon: Send },
        { id: 'sendgrid', name: 'SendGrid', icon: Send },
    ] as const;

    const field = (name: Parameters<typeof form.control.register>[0], labelKey: string, type: 'text' | 'password' | 'number' = 'text', wide = false) => (
        <FormField control={form.control} name={name} render={({ field: f }) => (
            <FormItem className={wide ? 'sm:col-span-2' : undefined}>
                <FormLabel>{t(labelKey)}</FormLabel>
                <FormControl>
                    {type === 'number'
                        ? <Input type="number" {...f} value={f.value as number} onChange={e => f.onChange(parseInt(e.target.value))} />
                        : <Input type={type} autoComplete={type === 'password' ? 'new-password' : 'off'} {...f} value={(f.value as string) ?? ''} />}
                </FormControl>
                <FormMessage />
            </FormItem>
        )} />
    );

    const configFooter = (
        <>
            <Button type="button" variant="outline" className="mr-auto gap-2" onClick={() => setIsTestDialogOpen(true)}>
                <Mail className="h-4 w-4" /> {t('email.testSMTP')}
            </Button>
            <Button type="submit" disabled={isUpdating} className="gap-2">
                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t('common.save')}
            </Button>
        </>
    );

    const configTitle: Record<string, string> = {
        smtp: 'emailSettings.smtpConfiguration',
        mailgun: 'emailSettings.mailgunConfiguration',
        mailjet: 'emailSettings.mailjetConfiguration',
        sendgrid: 'emailSettings.sendgridConfiguration',
    };

    return (
        <div className="space-y-6">
            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Enable Email */}
                    <SettingsSection
                        title={t('email.globalToggle')}
                        description={t('emailSettings.globalToggleDescription')}
                        icon={Power}
                        action={
                            <FormField
                                control={form.control}
                                name="enabled"
                                render={({ field }) => (
                                    <FormItem className="flex flex-row items-center gap-3 space-y-0">
                                        <span className={cn(
                                            'rounded-full px-2.5 py-0.5 text-xs font-medium',
                                            field.value ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground',
                                        )}>
                                            {field.value ? t('emailSettings.statusOn') : t('emailSettings.statusOff')}
                                        </span>
                                        <FormControl>
                                            <Switch checked={field.value} onCheckedChange={field.onChange} aria-label={t('email.globalToggle')} />
                                        </FormControl>
                                    </FormItem>
                                )}
                            />
                        }
                        footer={!emailEnabled && (
                            <Button type="submit" disabled={isUpdating} className="gap-2">
                                {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {t('common.save')}
                            </Button>
                        )}
                    />

                    {emailEnabled && (
                        <>
                            {/* Provider */}
                            <SettingsSection title={t('email.provider')} description={t('emailSettings.providerDescription')} icon={Server}>
                                <FormField
                                    control={form.control}
                                    name="provider"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormControl>
                                                <RadioGroup onValueChange={field.onChange} value={field.value} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                                    {providers.map(({ id, name, icon: Icon }) => (
                                                        <div key={id}>
                                                            <RadioGroupItem value={id} id={`provider-${id}`} className="peer sr-only" />
                                                            <Label
                                                                htmlFor={`provider-${id}`}
                                                                className="relative flex h-full cursor-pointer flex-col gap-2 rounded-xl border-2 border-muted p-4 transition-all hover:border-primary/40 hover:bg-accent/40 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5"
                                                            >
                                                                <span className={cn(
                                                                    'flex h-9 w-9 items-center justify-center rounded-lg',
                                                                    field.value === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                                                                )}>
                                                                    <Icon className="h-4 w-4" />
                                                                </span>
                                                                <span className="font-semibold">{name}</span>
                                                                <span className="text-xs font-normal text-muted-foreground">{t(`emailSettings.providerHints.${id}`)}</span>
                                                                {field.value === id && (
                                                                    <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                                                        <Check className="h-3 w-3" />
                                                                    </span>
                                                                )}
                                                            </Label>
                                                        </div>
                                                    ))}
                                                </RadioGroup>
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </SettingsSection>

                            {/* Provider configuration */}
                            <SettingsSection title={t(configTitle[emailProvider] ?? configTitle.smtp)} icon={KeyRound} footer={configFooter}>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    {emailProvider === 'smtp' && <>
                                        {field('smtp.host', 'email.smtpHost')}
                                        {field('smtp.port', 'email.smtpPort', 'number')}
                                        {field('smtp.user', 'email.smtpUser')}
                                        {field('smtp.pass', 'email.smtpPassword', 'password')}
                                        {field('smtp.from', 'email.fromAddress', 'text', true)}
                                    </>}
                                    {emailProvider === 'mailgun' && <>
                                        {field('mailgun.apiKey', 'email.apiKey', 'password')}
                                        {field('mailgun.domain', 'email.domain')}
                                        {field('mailgun.from', 'email.fromAddress', 'text', true)}
                                    </>}
                                    {emailProvider === 'mailjet' && <>
                                        {field('mailjet.apiKey', 'email.apiKey')}
                                        {field('mailjet.secretKey', 'email.secretKey', 'password')}
                                        {field('mailjet.from', 'email.fromAddress', 'text', true)}
                                    </>}
                                    {emailProvider === 'sendgrid' && <>
                                        {field('sendgrid.apiKey', 'email.apiKey', 'password', true)}
                                        {field('sendgrid.from', 'email.fromAddress', 'text', true)}
                                    </>}
                                </div>
                            </SettingsSection>
                        </>
                    )}
                </form>
            </Form>

            <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-400">
                            <Send className="h-5 w-5" />
                        </div>
                        <DialogTitle>{t('emailSettings.testEmailTitle')}</DialogTitle>
                        <DialogDescription>{t('emailSettings.testEmailDescription')}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 py-2">
                        <Label htmlFor="test-email">{t('emailSettings.recipient')}</Label>
                        <Input
                            id="test-email"
                            type="email"
                            value={testEmailTo}
                            onChange={(e) => setTestEmailTo(e.target.value)}
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>
                            {t('common.cancel')}
                        </Button>
                        <Button onClick={handleTestConnection} disabled={isTestingEmail} className="gap-2">
                            {isTestingEmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                            {t('emailSettings.sendTest')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
