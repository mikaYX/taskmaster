import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useTestChannel } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Trash2, Edit, Play, Plus, Loader2, Bell, BellOff, Webhook, AlertTriangle } from "lucide-react";
import { CHANNEL_ICON, CHANNEL_TONE, TODO_CHANNELS_SETTING } from "../components/channel-style";
import { useSettings } from "../hooks/use-settings";
import { cn } from "@/lib/utils";

import { SettingsSection } from "../components/settings-section";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import type { NotificationChannel } from "@/api/notifications";

const createChannelSchema = (t: (key: string) => string) => z.object({
    name: z.string().min(1, t('settings.notifications.validation.nameRequired')),
    type: z.enum(["EMAIL", "TEAMS", "SLACK", "WEBHOOK", "TELEGRAM", "DISCORD", "PUSH"]),
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()),
});

type ChannelFormValues = z.infer<ReturnType<typeof createChannelSchema>>;

export function NotificationsSettingsPage() {
    const { t } = useTranslation();
    const channelSchema = createChannelSchema(t);
    const { data: channels, isLoading } = useChannels();
    const createMutation = useCreateChannel();
    const updateMutation = useUpdateChannel();
    const deleteMutation = useDeleteChannel();
    const testMutation = useTestChannel();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [channelToDelete, setChannelToDelete] = useState<number | null>(null);

    // Guard: a channel the todolist relies on is not switched off by accident.
    const [channelToDisable, setChannelToDisable] = useState<NotificationChannel | null>(null);
    const { getSetting, getSettingAsBool } = useSettings();
    const todoChannelIds = getSetting<unknown>(TODO_CHANNELS_SETTING);
    const isTodoLinked = (id: number | null) =>
        id !== null && getSettingAsBool('addons.todolist.enabled') && Array.isArray(todoChannelIds) && todoChannelIds.includes(id);

    const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
    const [channelToTest, setChannelToTest] = useState<NotificationChannel | null>(null);
    const [testEmail, setTestEmail] = useState("");

    const form = useForm<ChannelFormValues>({
        resolver: zodResolver(channelSchema),
        defaultValues: {
            name: "",
            type: "EMAIL",
            enabled: true,
            config: {},
        },
    });
    const watchType = useWatch({
        control: form.control,
        name: "type",
    });

    useEffect(() => {
        if (editingChannel) {
            form.reset({
                name: editingChannel.name,
                type: editingChannel.type,
                enabled: editingChannel.enabled,
                config: editingChannel.config,
            });
        } else {
            form.reset({
                name: "",
                type: "EMAIL",
                enabled: true,
                config: {},
            });
        }
    }, [editingChannel, form]);

    const onSubmit = async (values: ChannelFormValues) => {
        try {
            if (editingChannel) {
                await updateMutation.mutateAsync({
                    id: editingChannel.id,
                    dto: values,
                });
                toast.success(t('settings.notifications.updated'));
            } else {
                await createMutation.mutateAsync(values);
                toast.success(t('settings.notifications.created'));
            }
            setIsDialogOpen(false);
            setEditingChannel(null);
        } catch {
            toast.error(t('settings.notifications.error'));
        }
    };

    const setEnabled = async (channel: NotificationChannel, enabled: boolean) => {
        try {
            await updateMutation.mutateAsync({ id: channel.id, dto: { enabled } });
            toast.success(t('common.updated'));
        } catch {
            toast.error(t('common.error'));
        }
    };

    const confirmDelete = async () => {
        if (!channelToDelete) return;
        try {
            await deleteMutation.mutateAsync(channelToDelete);
            toast.success(t('settings.notifications.deleted'));
            setIsDeleteDialogOpen(false);
            setChannelToDelete(null);
        } catch {
            toast.error(t('settings.notifications.deleteError'));
        }
    };

    const executeTest = async () => {
        if (!channelToTest) return;
        try {
            await testMutation.mutateAsync({
                id: channelToTest.id,
                data: channelToTest.type === 'EMAIL' ? { testEmailAddress: testEmail } : undefined,
            });
            toast.success(t('settings.notifications.testSuccess'));
            setIsTestDialogOpen(false);
            setTestEmail("");
            setChannelToTest(null);
        } catch {
            toast.error(t('settings.notifications.testError'));
        }
    };

    const openEditDialog = (channel: NotificationChannel) => {
        setEditingChannel(channel);
        setIsDialogOpen(true);
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    const getChannelTypeLabel = (type: ChannelFormValues['type'] | NotificationChannel['type']) => {
        const key = type.toLowerCase();
        return t(`settings.notifications.types.${key}`);
    };

    return (
        <div className="space-y-6">
            <SettingsSection
                title={t('settings.notifications.title')}
                description={t('settings.notifications.description')}
                icon={Bell}
                action={
                    <Button className="gap-2" onClick={() => { setEditingChannel(null); setIsDialogOpen(true); }}>
                        <Plus className="h-4 w-4" />
                        {t('settings.notifications.add')}
                    </Button>
                }
            >
            {channels && channels.length === 0 && (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <BellOff className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('settings.notifications.empty')}</p>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels?.map((channel) => (
                    <div key={channel.id} className={cn('flex flex-col gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md', !channel.enabled && 'opacity-70')}>
                        <div className="flex items-start gap-3">
                            <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', CHANNEL_TONE[channel.type.toLowerCase()] ?? CHANNEL_TONE.webhook)}>
                                {(() => { const Icon = CHANNEL_ICON[channel.type.toLowerCase()] ?? Webhook; return <Icon className="h-5 w-5" />; })()}
                            </span>
                            <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">{channel.name}</p>
                                <p className="text-xs text-muted-foreground">{getChannelTypeLabel(channel.type)}</p>
                                {isTodoLinked(channel.id) && (
                                    <span className="mt-1 inline-flex items-center rounded-full bg-violet-500/10 px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-400">
                                        {t('settings.todoNotifications.linkedBadge')}
                                    </span>
                                )}
                            </div>
                            <Switch
                                aria-label={channel.name}
                                checked={channel.enabled}
                                onCheckedChange={(val) => {
                                    if (!val && isTodoLinked(channel.id)) {
                                        setChannelToDisable(channel);
                                        return;
                                    }
                                    void setEnabled(channel, val);
                                }}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-2 border-t pt-3">
                            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', channel.enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-muted text-muted-foreground')}>
                                <span className={cn('h-1.5 w-1.5 rounded-full', channel.enabled ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                                {channel.enabled ? t('emailSettings.statusOn') : t('emailSettings.statusOff')}
                            </span>
                            <div className="flex gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" aria-label={t('settings.notifications.testAria')} title={t('settings.notifications.testAria')} onClick={() => { setChannelToTest(channel); setIsTestDialogOpen(true); }}>
                                    <Play className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" aria-label={t('settings.notifications.editChannel')} title={t('settings.notifications.editChannel')} onClick={() => openEditDialog(channel)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={t('settings.notifications.deleteAria')} title={t('settings.notifications.deleteAria')} onClick={() => { setChannelToDelete(channel.id); setIsDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            </SettingsSection>

            {/* Editor Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingChannel ? t('settings.notifications.editChannel') : t('settings.notifications.addChannel')}</DialogTitle>
                    </DialogHeader>
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('common.name')}</FormLabel>
                                        <FormControl>
                                            <Input {...field} placeholder={t('settings.notifications.namePlaceholder')} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <FormField
                                control={form.control}
                                name="type"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('common.type')}</FormLabel>
                                        <Select onValueChange={field.onChange} defaultValue={field.value} disabled={!!editingChannel}>
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('settings.notifications.typePlaceholder')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">{t('settings.notifications.types.email')}</SelectItem>
                                                <SelectItem value="SLACK">{t('settings.notifications.types.slack')}</SelectItem>
                                                <SelectItem value="TEAMS">{t('settings.notifications.types.teams')}</SelectItem>
                                                <SelectItem value="DISCORD">{t('settings.notifications.types.discord')}</SelectItem>
                                                <SelectItem value="TELEGRAM">{t('settings.notifications.types.telegram')}</SelectItem>
                                                <SelectItem value="WEBHOOK">{t('settings.notifications.types.webhook')}</SelectItem>
                                                <SelectItem value="PUSH">{t('settings.notifications.types.push')}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            {/* Dynamic Config Fields */}
                            {(watchType === 'SLACK' || watchType === 'TEAMS' || watchType === 'DISCORD') && (
                                <FormField
                                    control={form.control}
                                    name="config.webhookUrl"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>{t('settings.notifications.fields.webhookUrl')}</FormLabel>
                                            <FormControl>
                                                <Input {...field} value={(field.value as string) || ''} onChange={field.onChange} placeholder="https://..." />
                                            </FormControl>
                                        </FormItem>
                                    )}
                                />
                            )}

                            {watchType === 'TELEGRAM' && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="config.botToken"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('settings.notifications.fields.botToken')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={(field.value as string) || ''} onChange={field.onChange} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="config.chatId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('settings.notifications.fields.chatId')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={(field.value as string) || ''} onChange={field.onChange} />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}

                            {watchType === 'WEBHOOK' && (
                                <>
                                    <FormField
                                        control={form.control}
                                        name="config.webhookUrl"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('settings.notifications.fields.url')}</FormLabel>
                                                <FormControl>
                                                    <Input {...field} value={(field.value as string) || ''} onChange={field.onChange} placeholder="https://..." />
                                                </FormControl>
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="config.method"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>{t('settings.notifications.fields.httpMethod')}</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={(field.value as string) || "POST"}>
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        <SelectItem value="POST">POST</SelectItem>
                                                        <SelectItem value="GET">GET</SelectItem>
                                                        <SelectItem value="PUT">PUT</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </FormItem>
                                        )}
                                    />
                                </>
                            )}

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    {t('common.cancel')}
                                </Button>
                                <Button type="submit">
                                    {t('common.save')}
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {/* Delete Dialog */}
            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('common.confirmDelete')}</DialogTitle>
                        <DialogDescription>
                            {t('settings.notifications.deleteWarning')}
                        </DialogDescription>
                    </DialogHeader>
                    {isTodoLinked(channelToDelete) && (
                        <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                            <p>{t('settings.todoNotifications.linkedDeleteWarning')}</p>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="destructive" onClick={confirmDelete}>{t('common.delete')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Disabling a channel the todolist uses */}
            <Dialog open={channelToDisable !== null} onOpenChange={(open) => { if (!open) setChannelToDisable(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                            {t('settings.todoNotifications.linkedTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('settings.todoNotifications.linkedDisableWarning', { name: channelToDisable?.name ?? '' })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setChannelToDisable(null)}>{t('common.cancel')}</Button>
                        <Button
                            variant="destructive"
                            onClick={() => {
                                if (channelToDisable) void setEnabled(channelToDisable, false);
                                setChannelToDisable(null);
                            }}
                        >
                            {t('settings.todoNotifications.disableAnyway')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Test Dialog */}
            <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('settings.notifications.testChannel')}</DialogTitle>
                        <DialogDescription>
                            {t('settings.notifications.testDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    {channelToTest?.type === 'EMAIL' && (
                        <div className="space-y-4 py-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">{t('settings.notifications.testEmailAddress')}</label>
                                <Input
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                    placeholder="test@example.com"
                                    type="email"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsTestDialogOpen(false)}>{t('common.cancel')}</Button>
                        <Button onClick={executeTest} disabled={channelToTest?.type === 'EMAIL' && !testEmail}>
                            {t('common.test')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
