import { useTranslation } from 'react-i18next';
import { useTodoSummary } from '@/hooks/use-todos';
import { cn } from '@/lib/utils';

/**
 * How many open todos need attention (late or due today). Red as soon as one is late,
 * amber when it is only today. Nothing when there is nothing to do.
 */
export function TodoAttentionBadge({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { data } = useTodoSummary();
    const count = (data?.overdue ?? 0) + (data?.dueToday ?? 0);
    if (!data || count === 0) return null;

    return (
        <span
            role="status"
            aria-label={t('todos.badge', { overdue: data.overdue, today: data.dueToday })}
            title={t('todos.badge', { overdue: data.overdue, today: data.dueToday })}
            className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold leading-none text-white',
                data.overdue > 0 ? 'bg-destructive' : 'bg-amber-500',
                className,
            )}
        >
            {count > 99 ? '99+' : count}
        </span>
    );
}
