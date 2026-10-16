import { format } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useDebounce } from '@/hooks/use-debounce';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { correctiveActionsApi } from '@/api/corrective-actions';
import { getErrorMessage } from '@/api/http';
import type { CorrectiveAction } from '@/api/types';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function CorrectiveActionsPage() {
    const userId = useAuthStore(state => state.userId);
    const siteId = useSiteStore(state => state.currentSiteId);
    return <ActionsWorkspace key={`${userId}:${siteId}`} />;
}

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
    return <div className="max-w-5xl mx-auto space-y-5">
        <h1 className="text-2xl font-semibold">{t('execution.correctiveActions')}</h1>
        <p className="text-muted-foreground">{t('execution.correctiveDescription')}</p>
        <div className="flex gap-2">{(['OPEN', 'CLOSED'] as const).map(state => <Button key={state} variant={filter === state ? 'default' : 'outline'} aria-pressed={filter === state} onClick={() => { setFilter(state); setPage(1); }}>{t(`execution.state.${state}`)}</Button>)}</div>
        <div className="flex flex-wrap items-center gap-4">
            <div className="space-y-1 flex-1 min-w-48">
                <Label htmlFor="action-search">{t('execution.search')}</Label>
                <Input id="action-search" value={search} maxLength={100} onChange={event => { setSearch(event.target.value); setPage(1); }} />
            </div>
            <Label className="flex items-center gap-2"><Checkbox checked={mine} onCheckedChange={value => { setMine(value === true); setPage(1); }} />{t('execution.onlyMine')}</Label>
            {filter === 'OPEN' && <Label className="flex items-center gap-2"><Checkbox checked={overdueOnly} onCheckedChange={value => { setOverdueOnly(value === true); setPage(1); }} />{t('execution.onlyOverdue')}</Label>}
        </div>
        {actions.isPending && <p role="status">{t('common.loading')}</p>}
        {actions.isError && <p role="alert" className="text-destructive">{getErrorMessage(actions.error, t('execution.loadFailed'))}</p>}
        {actions.data?.items.map(action => <ActionCard key={action.id} action={action} canUpdate={canManage || action.assigneeId === userId} onUpdated={async () => { setPage(1); await client.invalidateQueries({ queryKey: ['corrective-actions'] }); }} />)}
        {actions.data && actions.data.items.length === 0 && <p className="rounded-lg border p-8 text-center text-muted-foreground">{t('execution.noActions')}</p>}
        {actions.data && <nav aria-label={t('execution.pagination')} className="flex items-center justify-between gap-3">
            <Button variant="outline" disabled={page === 1 || actions.isFetching} onClick={() => setPage(value => value - 1)}>{t('common.previous')}</Button>
            <p role="status" className="text-sm">{t('execution.pageSummary', { page, pages: Math.max(1, Math.ceil(actions.data.total / actions.data.pageSize)), total: actions.data.total })}</p>
            <Button variant="outline" disabled={page * actions.data.pageSize >= actions.data.total || actions.isFetching} onClick={() => setPage(value => value + 1)}>{t('common.next')}</Button>
        </nav>}
    </div>;
}

function ActionCard({ action, canUpdate, onUpdated }: { action: CorrectiveAction; canUpdate: boolean; onUpdated: () => Promise<unknown> }) {
    const { t } = useTranslation();
    const [resolution, setResolution] = useState(action.resolution ?? '');
    const update = useMutation({ mutationFn: (state: 'OPEN' | 'CLOSED') => correctiveActionsApi.update(action.id, state, resolution), onSuccess: onUpdated });
    const overdue = action.state === 'OPEN' && action.dueDate && action.dueDate.slice(0, 10) < format(new Date(), 'yyyy-MM-dd');
    return <article className="rounded-lg border bg-card p-5 space-y-3">
        <h2 className="font-semibold">{action.title}</h2>
        <p className="text-sm text-muted-foreground"><Link className="underline" to={`/task-definitions/${action.taskId}`}>{action.task.name}</Link> · {action.instanceDate.slice(0, 10)}</p>
        <p className="text-sm">{t('execution.assignee')}: {action.assignee.fullname || action.assignee.username}{action.dueDate && <> · {t('execution.dueDate')}: {action.dueDate.slice(0, 10)}</>}{overdue && <span className="ml-2 font-semibold text-destructive">{t('execution.overdue')}</span>}</p>
        {canUpdate && <>
            <Label htmlFor={`resolution-${action.id}`}>{t('execution.resolution')}</Label>
            <Textarea id={`resolution-${action.id}`} value={resolution} maxLength={2000} disabled={update.isPending} onChange={event => setResolution(event.target.value)} />
            <Button disabled={update.isPending || (action.state === 'OPEN' && !resolution.trim())} onClick={() => update.mutate(action.state === 'OPEN' ? 'CLOSED' : 'OPEN')}>{t(action.state === 'OPEN' ? 'execution.closeAction' : 'execution.reopenAction')}</Button>
        </>}
        {!canUpdate && action.resolution && <p className="text-sm whitespace-pre-wrap">{action.resolution}</p>}
        {update.isError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(update.error, t('execution.updateFailed'))}</p>}
    </article>;
}
