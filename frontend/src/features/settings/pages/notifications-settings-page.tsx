import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useChannels, useCreateChannel, useUpdateChannel, useDeleteChannel, useTestChannel } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Edit, Play, Plus, Loader2 } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import type { NotificationChannel } from "@/api/notifications";

const channelSchema = z.object({
    name: z.string().min(1, "Name is required"),
    type: z.enum(["EMAIL", "TEAMS", "SLACK", "WEBHOOK", "TELEGRAM", "DISCORD", "PUSH"]),
    enabled: z.boolean(),
    config: z.record(z.string(), z.unknown()),
});

type ChannelFormValues = z.infer<typeof channelSchema>;

export function NotificationsSettingsPage() {
    const { t } = useTranslation();
    const { data: channels, isLoading } = useChannels();
    const createMutation = useCreateChannel();
    const updateMutation = useUpdateChannel();
    const deleteMutation = useDeleteChannel();
    const testMutation = useTestChannel();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingChannel, setEditingChannel] = useState<NotificationChannel | null>(null);

    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [channelToDelete, setChannelToDelete] = useState<number | null>(null);

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

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">{t('settings.notifications.title')}</h3>
                <p className="text-sm text-muted-foreground">
                    {t('settings.notifications.description')}
                </p>
            </div>

            <div className="flex justify-end">
                <Button onClick={() => { setEditingChannel(null); setIsDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    {t('settings.notifications.add')}
                </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {channels?.map((channel) => (
                    <Card key={channel.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-md">{channel.name}</CardTitle>
                            <Switch
                                checked={channel.enabled}
                                onCheckedChange={async (val) => {
                                    try {
                                        await updateMutation.mutateAsync({ id: channel.id, dto: { enabled: val } });
                                        toast.success(t('common.updated'));
                                    } catch {
                                        toast.error(t('common.error'));
                                    }
                                }}
                            />
                        </CardHeader>
                        <CardContent>
                            <CardDescription className="mb-4">
                                {channel.type}
                            </CardDescription>
                            <div className="flex justify-end gap-2">
                                <Button variant="outline" size="icon" onClick={() => { setChannelToTest(channel); setIsTestDialogOpen(true); }}>
                                    <Play className="h-4 w-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={() => openEditDialog(channel)}>
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button variant="destructive" size="icon" onClick={() => { setChannelToDelete(channel.id); setIsDeleteDialogOpen(true); }}>
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

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
                                            <Input {...field} placeholder="My Channel" />
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
                                                    <SelectValue placeholder="Select type" />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                <SelectItem value="EMAIL">Email</SelectItem>
                                                <SelectItem value="SLACK">Slack</SelectItem>
                                                <SelectItem value="TEAMS">Teams</SelectItem>
                                                <SelectItem value="DISCORD">Discord</SelectItem>
                                                <SelectItem value="TELEGRAM">Telegram</SelectItem>
                                                <SelectItem value="WEBHOOK">Webhook (Custom)</SelectItem>
                                                <SelectItem value="PUSH">Push (Not yet implemented)</SelectItem>
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
                                            <FormLabel>Webhook URL</FormLabel>
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
                                                <FormLabel>Bot Token</FormLabel>
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
                                                <FormLabel>Chat ID</FormLabel>
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
                                                <FormLabel>URL</FormLabel>
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
                                                <FormLabel>HTTP Method</FormLabel>
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
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="destructive" onClick={confirmDelete}>{t('common.delete')}</Button>
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
