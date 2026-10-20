import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { todoKeys, useTodoPreferences, useUpdateTodoPreferences } from '@/hooks/use-todos';
import { getErrorMessage } from '@/api/http';

/** How this person wants to be reminded: email, browser pop-up, and collective todos. */
export function TodoReminderSettings() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const prefs = useTodoPreferences();
    const update = useUpdateTodoPreferences();
    const push = usePushNotifications();

    const save = (patch: Parameters<typeof update.mutate>[0]) =>
        update.mutate(patch, { onError: (error) => toast.error(getErrorMessage(error, t('todos.reminders.saveFailed'))) });

    const toggleDevice = async () => {
        if (push.isSubscribed) await push.unsubscribe();
        else await push.subscribe();
        void queryClient.invalidateQueries({ queryKey: todoKeys.preferences });
    };

    const devices = prefs.data?.pushDevices ?? 0;
    let pushStatus: string | null = null;
    if (prefs.data && !prefs.data.pushAvailable) pushStatus = t('todos.reminders.pushServerOff');
    else if (!push.isSupported) pushStatus = t('todos.reminders.pushUnsupported');
    else if (push.permission === 'denied') pushStatus = t('todos.reminders.pushDenied');

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                    <BellRing className="h-4 w-4" />
                    {t('todos.reminders.button')}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 space-y-4">
                <div>
                    <h2 className="text-sm font-semibold">{t('todos.reminders.title')}</h2>
                    <p className="text-xs text-muted-foreground">{t('todos.reminders.description')}</p>
                </div>

                {prefs.isLoading || !prefs.data ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="todo-pref-email" className="font-normal">
                                {t('todos.reminders.email')}
                            </Label>
                            <Switch
                                id="todo-pref-email"
                                checked={prefs.data.email}
                                onCheckedChange={(checked) => save({ email: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="todo-pref-push" className="font-normal">
                                {t('todos.reminders.push')}
                            </Label>
                            <Switch
                                id="todo-pref-push"
                                checked={prefs.data.push}
                                onCheckedChange={(checked) => save({ push: checked })}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <div className="space-y-0.5">
                                <Label htmlFor="todo-pref-collective" className="font-normal">
                                    {t('todos.reminders.collective')}
                                </Label>
                                <p className="text-xs text-muted-foreground">{t('todos.reminders.collectiveHint')}</p>
                            </div>
                            <Switch
                                id="todo-pref-collective"
                                checked={prefs.data.collective}
                                onCheckedChange={(checked) => save({ collective: checked })}
                            />
                        </div>

                        <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                            <p className="text-xs font-medium">{t('todos.reminders.device')}</p>
                            {pushStatus ? (
                                <p className="text-xs text-muted-foreground">{pushStatus}</p>
                            ) : (
                                <>
                                    <p className="text-xs text-muted-foreground">
                                        {push.isSubscribed
                                            ? t('todos.reminders.deviceOn')
                                            : t('todos.reminders.deviceOff')}
                                        {devices > 0 && ` ${t('todos.reminders.deviceCount', { count: devices })}`}
                                    </p>
                                    <Button
                                        size="sm"
                                        variant={push.isSubscribed ? 'outline' : 'default'}
                                        disabled={push.isLoading}
                                        onClick={() => void toggleDevice()}
                                    >
                                        {push.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        {push.isSubscribed ? t('todos.reminders.disableDevice') : t('todos.reminders.enableDevice')}
                                    </Button>
                                    {push.error && <p className="text-xs text-destructive">{push.error}</p>}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
