import { useTranslation } from 'react-i18next';
import { BellOff, BellRing, Inbox, Loader2, Webhook } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useChannels } from '@/hooks/use-notifications';
import { SettingsSection } from '../components/settings-section';
import { CHANNEL_ICON, CHANNEL_TONE, TODO_CHANNELS_SETTING } from '../components/channel-style';
import { useSettings } from '../hooks/use-settings';

/** What a channel does for a todo: email and push reach each person, the others the whole team. */
const reachKey = (type: string) =>
    type === 'EMAIL' ? 'settings.todoNotifications.reach.email'
        : type === 'PUSH' ? 'settings.todoNotifications.reach.push'
            : 'settings.todoNotifications.reach.team';

/**
 * Which notification channels the todolist uses when a collective todo is created or
 * assigned. Only channels configured (and enabled) under "Notification channels" count.
 */
export function TodoNotificationsSettingsPage() {
    const { t } = useTranslation();
    const { data: channels, isLoading } = useChannels();
    const { getSetting, updateSetting } = useSettings();

    const raw = getSetting<unknown>(TODO_CHANNELS_SETTING);
    const selected = Array.isArray(raw) ? (raw as number[]) : [];

    const toggle = (id: number, on: boolean) => {
        const next = on ? [...new Set([...selected, id])] : selected.filter((other) => other !== id);
        updateSetting({ key: TODO_CHANNELS_SETTING, value: next });
    };

    if (isLoading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;
    }

    return (
        <div className="space-y-6">
            <SettingsSection
                title={t('settings.todoNotifications.title')}
                description={t('settings.todoNotifications.description')}
                icon={BellRing}
            >
                <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/30 px-4 py-3">
                    <Inbox className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('settings.todoNotifications.bellAlways')}</p>
                </div>

                {channels && channels.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                            <BellOff className="h-6 w-6 text-muted-foreground" />
                        </div>
                        <p className="text-sm text-muted-foreground">{t('settings.todoNotifications.empty')}</p>
                    </div>
                ) : (
                    <ul className="divide-y rounded-xl border">
                        {channels?.map((channel) => {
                            const type = channel.type.toLowerCase();
                            const Icon = CHANNEL_ICON[type] ?? Webhook;
                            const linked = selected.includes(channel.id);
                            return (
                                <li key={channel.id} className={cn('flex items-center gap-3 px-4 py-3', !channel.enabled && 'opacity-70')}>
                                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', CHANNEL_TONE[type] ?? CHANNEL_TONE.webhook)}>
                                        <Icon className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-medium">
                                            {channel.name}
                                            <span className="ml-2 text-xs font-normal text-muted-foreground">{t(`settings.notifications.types.${type}`)}</span>
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {channel.enabled ? t(reachKey(channel.type)) : t('settings.todoNotifications.channelOff')}
                                        </p>
                                    </div>
                                    <Switch
                                        aria-label={t('settings.todoNotifications.toggleAria', { name: channel.name })}
                                        checked={linked}
                                        disabled={!channel.enabled && !linked}
                                        onCheckedChange={(on) => toggle(channel.id, on)}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SettingsSection>
        </div>
    );
}
