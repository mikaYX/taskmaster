import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    CircleDot,
    ClipboardList,
    Clock,
    Loader2,
    RotateCcw,
    Search,
    ShieldCheck,
    User,
} from 'lucide-react';
import { correctiveActionsApi } from '@/api/corrective-actions';
import { getErrorMessage } from '@/api/http';
import type { CorrectiveAction } from '@/api/types';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { getDateLocale } from '@/lib/date-locale';
import { cn } from '@/lib/utils';

export default function CorrectiveActionsPage() {
    const userId = useAuthStore(state => state.userId);
    const siteId = useSiteStore(state => state.currentSiteId);
    return <ActionsWorkspace key={`${userId}:${siteId}`} />;
}

/** "2026-10-20…" → a short date in the app language. */
const shortDate = (iso: string) =>
    new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString(getDateLocale().code, { day: 'numeric', month: 'short', year: 'numeric' });

function ActionsWorkspace() {
    const { t } = useTranslation();
    const client = useQueryClient();
    const siteId = useSiteStore(state => state.currentSiteId);
    const { userId, role } = useAuthStore();
    const [filter, setFilter] = useState<'OPEN' | 'CLOSED'>('OPEN');
    const [search, setSearch] = useState('');
    const [mine, setMine] = useState(false);
    const [overdueOnly, setOverdueOnly] = useState(false);
    const [page, setPage] = useState(1);
    const query = useDebounce(search, 300);
    const today = format(new Date(), 'yyyy-MM-dd');
    const actions = useQuery({
        queryKey: ['corrective-actions', userId, siteId, filter, query, mine, overdueOnly, today, page],
        queryFn: () => correctiveActionsApi.search({ page, state: filter, search: query || undefined, mine: mine ? 'true' : undefined, overdueBefore: overdueOnly && filter === 'OPEN' ? today : undefined }),
        refetchOnWindowFocus: true, refetchInterval: 60000,
    });
    const canManage = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role ?? '');
    const pages = actions.data ? Math.max(1, Math.ceil(actions.data.total / actions.data.pageSize)) : 1;

    const toggle = (pressed: boolean, onClick: () => void, Icon: typeof User, label: string) => (
        <Button
            type="button"
            variant={pressed ? 'default' : 'outline'}
            role="checkbox"
            aria-checked={pressed}
            className="gap-2"
            onClick={onClick}
        >
            <Icon className="h-4 w-4" />
            {label}
        </Button>
    );

    return <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 pt-4 sm:pt-6">
        {/* ========== HEADER ========== */}
        <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">{t('execution.correctiveActions')}</h1>
                <p className="max-w-2xl text-sm text-muted-foreground">{t('execution.correctiveDescription')}</p>
            </div>
        </div>

        {/* ========== STATE TABS ========== */}
        <div role="group" aria-label={t('correctiveList.stateLabel')} className="inline-flex rounded-xl border bg-muted/40 p-1">
            {(['OPEN', 'CLOSED'] as const).map(state => {
                const Icon = state === 'OPEN' ? CircleDot : CheckCircle2;
                const active = filter === state;
                return <button
                    key={state}
                    type="button"
                    aria-pressed={active}
                    onClick={() => { setFilter(state); setPage(1); }}
                    className={cn(
                        'inline-flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all',
                        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                >
                    <Icon className={cn('h-4 w-4', active && (state === 'OPEN' ? 'text-amber-500' : 'text-emerald-500'))} />
                    {t(`execution.state.${state}`)}
                    {active && actions.data && (
                        <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">{actions.data.total}</span>
                    )}
                </button>;
            })}
        </div>

        {/* ========== TOOLBAR ========== */}
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
            <div className="relative flex-1">
                <Label htmlFor="action-search" className="sr-only">{t('execution.search')}</Label>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    id="action-search"
                    value={search}
                    maxLength={100}
                    placeholder={t('execution.search')}
                    className="pl-9"
                    onChange={event => { setSearch(event.target.value); setPage(1); }}
                />
            </div>
            <div className="flex flex-wrap gap-2">
                {toggle(mine, () => { setMine(value => !value); setPage(1); }, User, t('execution.onlyMine'))}
                {filter === 'OPEN' && toggle(overdueOnly, () => { setOverdueOnly(value => !value); setPage(1); }, AlertTriangle, t('execution.onlyOverdue'))}
            </div>
        </div>

        {/* ========== LIST ========== */}
        {actions.isPending && <div role="status" aria-label={t('common.loading')} className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
        </div>}
        {actions.isError && <div role="alert" className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {getErrorMessage(actions.error, t('execution.loadFailed'))}
        </div>}

        {actions.data && actions.data.items.length > 0 && <div className="space-y-3">
            {actions.data.items.map(action => <ActionCard key={action.id} action={action} canUpdate={canManage || action.assigneeId === userId} onUpdated={async () => { setPage(1); await client.invalidateQueries({ queryKey: ['corrective-actions'] }); }} />)}
        </div>}

        {actions.data && actions.data.items.length === 0 && <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground">{t('execution.noActions')}</p>
        </div>}

        {actions.data && <nav aria-label={t('execution.pagination')} className="flex items-center justify-between gap-3">
            <Button variant="outline" size="sm" className="gap-1" disabled={page === 1 || actions.isFetching} onClick={() => setPage(value => value - 1)}>
                <ChevronLeft className="h-4 w-4" />
                {t('common.previous')}
            </Button>
            <p role="status" className="text-sm text-muted-foreground">{t('execution.pageSummary', { page, pages, total: actions.data.total })}</p>
            <Button variant="outline" size="sm" className="gap-1" disabled={page * actions.data.pageSize >= actions.data.total || actions.isFetching} onClick={() => setPage(value => value + 1)}>
                {t('common.next')}
                <ChevronRight className="h-4 w-4" />
            </Button>
        </nav>}
    </div>;
}

function ActionCard({ action, canUpdate, onUpdated }: { action: CorrectiveAction; canUpdate: boolean; onUpdated: () => Promise<unknown> }) {
    const { t } = useTranslation();
    const [resolution, setResolution] = useState(action.resolution ?? '');
    const update = useMutation({ mutationFn: (state: 'OPEN' | 'CLOSED') => correctiveActionsApi.update(action.id, state, resolution), onSuccess: onUpdated });
    const isOpen = action.state === 'OPEN';
    const overdue = isOpen && action.dueDate && action.dueDate.slice(0, 10) < format(new Date(), 'yyyy-MM-dd');
    const assignee = action.assignee.fullname || action.assignee.username;

    return <article className="relative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md">
        <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', overdue ? 'bg-red-500' : isOpen ? 'bg-amber-500' : 'bg-emerald-500')} />
        <div className="space-y-4 p-5 pl-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className={cn(
                            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                            isOpen ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
                        )}>
                            {isOpen ? <CircleDot className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                            {t(isOpen ? 'correctiveList.open' : 'correctiveList.closed')}
                        </span>
                        {overdue && <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3" />
                            {t('execution.overdue')}
                        </span>}
                    </div>
                    <h2 className="break-words text-base font-semibold leading-snug">{action.title}</h2>
                </div>
                {!isOpen && action.closedAt && <span className="text-xs text-muted-foreground">{t('correctiveList.closedOn', { date: shortDate(action.closedAt) })}</span>}
            </div>

            <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                <li className="flex min-w-0 items-center gap-2">
                    <span className="sr-only">{t('correctiveList.task')}</span>
                    <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">
                        <Link className="font-medium text-primary hover:underline" to={`/task-definitions/${action.taskId}`}>{action.task.name}</Link>
                    </span>
                </li>
                <li className="flex items-center gap-2">
                    <span className="sr-only">{t('correctiveList.failedOn')}</span>
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-muted-foreground">{t('correctiveList.failedOnValue', { date: shortDate(action.instanceDate) })}</span>
                </li>
                <li className="flex min-w-0 items-center gap-2">
                    <span className="sr-only">{t('execution.assignee')}</span>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                        {assignee.substring(0, 2).toUpperCase()}
                    </span>
                    <span className="truncate">{assignee}</span>
                </li>
                {action.dueDate && <li className="flex items-center gap-2">
                    <span className="sr-only">{t('correctiveList.due')}</span>
                    <Clock className={cn('h-4 w-4 shrink-0', overdue ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')} />
                    <span className={cn(overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-muted-foreground')}>{t('correctiveList.dueValue', { date: shortDate(action.dueDate) })}</span>
                </li>}
            </ul>

            {canUpdate && <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <Label htmlFor={`resolution-${action.id}`} className="text-xs">{t('execution.resolution')}</Label>
                <Textarea
                    id={`resolution-${action.id}`}
                    value={resolution}
                    maxLength={2000}
                    rows={isOpen ? 3 : 2}
                    placeholder={isOpen ? t('correctiveList.resolutionPlaceholder') : undefined}
                    className="bg-background"
                    disabled={update.isPending}
                    onChange={event => setResolution(event.target.value)}
                />
                <div className="flex items-center justify-end">
                    <Button
                        variant={isOpen ? 'default' : 'outline'}
                        className="gap-2"
                        disabled={update.isPending || (isOpen && !resolution.trim())}
                        onClick={() => update.mutate(isOpen ? 'CLOSED' : 'OPEN')}
                    >
                        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : isOpen ? <CheckCircle2 className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                        {t(isOpen ? 'execution.closeAction' : 'execution.reopenAction')}
                    </Button>
                </div>
            </div>}
            {!canUpdate && action.resolution && <div className="rounded-lg border bg-muted/20 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">{t('execution.resolution')}</p>
                <p className="whitespace-pre-wrap text-sm">{action.resolution}</p>
            </div>}
            {update.isError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(update.error, t('execution.updateFailed'))}</p>}
        </div>
    </article>;
}
