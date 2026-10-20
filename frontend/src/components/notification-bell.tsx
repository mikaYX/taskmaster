import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useInbox, useMarkInboxRead } from '@/hooks/use-todos';
import { getDateLocale } from '@/lib/date-locale';
import { cn } from '@/lib/utils';
import type { InboxItem } from '@/api/types';

/**
 * The notification center: reminders, assignments and the activity on collective todos.
 * A click opens what the notification is about and marks it as read.
 */
export function NotificationBell() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { data } = useInbox();
    const markRead = useMarkInboxRead();

    const unread = data?.unread ?? 0;

    const openItem = (item: InboxItem) => {
        if (!item.readAt) markRead.mutate(item.id);
        setOpen(false);
        if (item.url) navigate(item.url);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="relative" aria-label={t('inbox.open', { count: unread })}>
                    <Bell className="h-4 w-4" />
                    {unread > 0 && (
                        <span
                            data-testid="inbox-unread"
                            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-white"
                        >
                            {unread > 99 ? '99+' : unread}
                        </span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-0">
                <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-sm font-semibold">{t('inbox.title')}</h2>
                    {unread > 0 && (
                        <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs"
                            disabled={markRead.isPending}
                            onClick={() => markRead.mutate('all')}
                        >
                            {t('inbox.markAllRead')}
                        </Button>
                    )}
                </div>
                {!data || data.items.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t('inbox.empty')}</p>
                ) : (
                    <ul className="max-h-96 overflow-y-auto divide-y">
                        {data.items.map((item) => (
                            <li key={item.id}>
                                <button
                                    type="button"
                                    onClick={() => openItem(item)}
                                    className={cn(
                                        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50 focus-visible:bg-accent/50 focus-visible:outline-none',
                                        !item.readAt && 'bg-primary/5',
                                    )}
                                >
                                    <span
                                        aria-hidden="true"
                                        className={cn(
                                            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                                            item.readAt ? 'bg-transparent' : 'bg-primary',
                                        )}
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium">{item.title}</span>
                                        {item.body && (
                                            <span className="block text-xs text-muted-foreground line-clamp-2">
                                                {item.body}
                                            </span>
                                        )}
                                        <span className="mt-1 block text-[11px] text-muted-foreground">
                                            {formatDistanceToNow(new Date(item.createdAt), {
                                                addSuffix: true,
                                                locale: getDateLocale(),
                                            })}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </PopoverContent>
        </Popover>
    );
}
