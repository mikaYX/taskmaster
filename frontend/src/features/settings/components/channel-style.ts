import { Bell, Mail, MessageSquare, Send, Webhook, type LucideIcon } from 'lucide-react';

/** Icon and colour of each notification channel type, keyed by the lower-case type. */
export const CHANNEL_ICON: Record<string, LucideIcon> = { email: Mail, slack: MessageSquare, teams: MessageSquare, discord: MessageSquare, telegram: Send, webhook: Webhook, push: Bell };
export const CHANNEL_TONE: Record<string, string> = {
    email: 'bg-rose-500/10 text-rose-700 dark:text-rose-400',
    slack: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    teams: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    discord: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    telegram: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    webhook: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    push: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

/** Ids of the channels the todolist uses on top of the bell (todo notifications settings). */
export const TODO_CHANNELS_SETTING = 'addons.todolist.notify.channelIds';
