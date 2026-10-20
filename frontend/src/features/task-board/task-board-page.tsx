import { useBoardWorkspace } from './use-board-workspace';
import { boardWorkspaceKey, resolveViewRange, snapshotViewRange } from './lib/board-views';
import { SavedViewsDialog } from './components/saved-views-dialog';
import { useSiteStore } from '@/stores/site-store';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CalendarIcon, Monitor, X, Search, Clock, CheckCircle2, CircleDot, LayoutDashboard } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useNetworkStatus } from '@/hooks/use-network-status';
import { useUIStore } from '@/stores/ui-store';
import { useTaskBoard } from './use-task-board';
import { TaskListSection } from './components/task-list-section';
import { TaskRow } from './components/task-row';
import { ProgressRing } from './components/progress-ring';
import { AdminStatusDialog } from './components/admin-status-dialog';
import type { BoardItem, TaskStatusValue } from '@/api/types';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useIsAdminOrManager } from '@/stores/auth-store';
import { cn } from '@/lib/utils';
import { PRESETS, getActivePresetLabel } from './lib/task-board-utils';

// ── Page ─────────────────────────────────────────────────────────────

export default function TaskBoardPage() {
    const userId = useAuthStore(state => state.userId);
    const siteId = useSiteStore(state => state.currentSiteId);
    const scope = boardWorkspaceKey(userId, siteId);
    return <TaskBoardWorkspace key={scope} scope={scope} />;
}

function TaskBoardWorkspace({ scope }: { scope: string }) {
    const { t, i18n } = useTranslation();
    const locale = i18n.resolvedLanguage?.startsWith('fr') ? fr : enUS;
    const { isOnline } = useNetworkStatus();
    const isManager = useIsAdminOrManager();
    const role = useAuthStore((state) => state.role);
    const isGuest = role === 'GUEST';

    const { isTvMode, setIsTvMode } = useUIStore();
    const workspace = useBoardWorkspace(scope, isManager);
    const { searchQuery, filterUserId, filterGroupId } = workspace.filters;
    const compact = workspace.filters.compact && !isTvMode;
    const setSearchQuery = (searchQuery: string) => workspace.setFilters({ searchQuery });
    const setFilterUserId = (filterUserId: number | undefined) => workspace.setFilters({ filterUserId, filterGroupId: undefined });
    const setFilterGroupId = (filterGroupId: number | undefined) => workspace.setFilters({ filterGroupId, filterUserId: undefined });

    // The directory only feeds the filter bar, which a TV account never sees; the API refuses it for that role.
    const { data: users } = useUsers(false, false, !isGuest);
    const { data: groups } = useGroups(!isGuest);

    const {
        buckets,
        isLoading,
        error,
        dateRange,
        setDateRange,
        showCompleted,
        setShowCompleted,
        updateStatus,
        isItemUpdating,
        dataUpdatedAt,
        isFetching,
        isRefetchError,
    } = useTaskBoard({
        filterUserId,
        filterGroupId,
        searchQuery,
        refetchInterval: isTvMode ? 30000 : undefined
    });

    const activePresetLabel = getActivePresetLabel(dateRange);
    const [adminDialogItem, setAdminDialogItem] = useState<BoardItem | null>(null);

    const handleStatusChange = (data: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) => {
        updateStatus(data);
    };

    const activeItems = useMemo(() => {
        const items = [
            ...buckets.pastDue.filter(i => i.status === 'RUNNING'),
            ...buckets.today.filter(i => i.status === 'RUNNING'),
            ...buckets.upcoming.filter(i => i.status === 'RUNNING'),
        ];
        return items.sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));
    }, [buckets]);

    const totalTasks = activeItems.length + buckets.completed.length;
    const urgentCount = buckets.pastDue.filter(i => i.status === 'RUNNING').length;
    const completedCount = buckets.completed.length;
    const percentage = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 100;

    if (error && !dataUpdatedAt) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center space-y-2">
                    <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                    <p className="text-muted-foreground">{t('taskBoard.loadError')}</p>
                </div>
            </div>
        );
    }

    const syncOk = isOnline && !isRefetchError;
    const stats = [
        { key: 'running', icon: Clock, value: activeItems.length, label: t('taskBoard.runningLabel'), tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-400' },
        { key: 'urgent', icon: AlertTriangle, value: urgentCount, label: t('taskBoard.urgentLabel', { count: urgentCount }), tone: urgentCount > 0 ? 'bg-red-500/10 text-red-600 dark:text-red-400' : 'bg-muted text-muted-foreground' },
        { key: 'completed', icon: CheckCircle2, value: completedCount, label: t('taskBoard.completedLabel'), tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
    ];

    return (
        <div
            data-density={compact ? "compact" : "comfortable"}
            className={cn("mx-auto w-full max-w-[1200px] pb-24", compact ? "space-y-3 pt-3" : "space-y-5 pt-4 sm:pt-6", isTvMode && "px-6")}
        >
            {/* ══════════════════ TV BANNER ══════════════════ */}
            {isTvMode && (
                <div className="flex items-center justify-between rounded-xl border bg-card px-5 py-3 shadow-sm">
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-2 text-sm font-bold text-foreground">
                            <Monitor className="h-4 w-4 text-primary" />
                            {t('taskBoard.tvDisplay')} {isGuest && t('taskBoard.readOnly')}
                        </span>
                        <span className="rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground">
                            {format(dateRange.start, "dd MMM", { locale })} – {format(dateRange.end, "dd MMM", { locale })}
                        </span>
                    </div>
                    {!isGuest && (
                        <Button variant="ghost" size="sm" onClick={() => setIsTvMode(false)} className="h-8 gap-2">
                            <X className="h-4 w-4" /> {t('taskBoard.exitTv')}
                        </Button>
                    )}
                </div>
            )}

            {/* ══════════════════ HEADER ══════════════════ */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary", isTvMode ? "h-14 w-14" : "h-12 w-12")}>
                        <LayoutDashboard className={isTvMode ? "h-7 w-7" : "h-6 w-6"} />
                    </div>
                    <div>
                        <h1 className={cn("font-bold tracking-tight text-foreground", isTvMode ? "text-3xl" : "text-2xl")}>{t('taskBoard.heading')}</h1>
                        <p className="text-sm capitalize text-muted-foreground">{format(new Date(), "EEEE d MMMM yyyy", { locale })}</p>
                    </div>
                </div>
                {!isTvMode && (
                    <Button variant="outline" size="sm" className="h-9 gap-2" onClick={() => setIsTvMode(true)}>
                        <Monitor className="h-4 w-4" /> {t('taskBoard.tvMode')}
                    </Button>
                )}
            </div>

            {/* ══════════════════ KPIs ══════════════════ */}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="col-span-2 flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm sm:col-span-1">
                    <ProgressRing percentage={percentage} size={compact ? 52 : isTvMode ? 96 : 72} strokeWidth={compact ? 6 : 8} />
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{t('taskBoard.progress')}</p>
                        <p className={cn("font-semibold tabular-nums", isTvMode ? "text-3xl" : "text-xl")}>
                            {completedCount}<span className="text-muted-foreground">/{totalTasks}</span>
                        </p>
                    </div>
                </div>
                {stats.map(({ key, icon: Icon, value, label, tone }) => (
                    <div key={key} className={cn("flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm", key === 'completed' && "col-span-2 sm:col-span-1")}>
                        <span className={cn("flex shrink-0 items-center justify-center rounded-xl", tone, isTvMode ? "h-14 w-14" : "h-11 w-11")}>
                            <Icon className={isTvMode ? "h-7 w-7" : "h-5 w-5"} />
                        </span>
                        <div className="min-w-0">
                            <p className={cn("font-semibold leading-none tabular-nums", isTvMode ? "text-4xl" : "text-2xl")}>{value}</p>
                            <p className="mt-1 truncate text-xs text-muted-foreground first-letter:uppercase">{label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* ══════════════════ TOOLBAR ══════════════════ */}
            {!isTvMode && !isGuest && (
                <div className="space-y-2.5 rounded-xl border bg-card p-3 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Presets */}
                        <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                            {PRESETS.map(preset => (
                                <Button
                                    key={t(`taskBoard.preset${PRESETS.indexOf(preset)}`)}
                                    variant="ghost"
                                    size="sm"
                                    className={cn(
                                        "h-7 rounded-md px-3 text-xs",
                                        activePresetLabel === preset.label
                                            ? "bg-background text-foreground shadow-sm hover:bg-background"
                                            : "text-muted-foreground hover:text-foreground"
                                    )}
                                    onClick={() => setDateRange(preset.getValue())}
                                >
                                    {t(`taskBoard.preset${PRESETS.indexOf(preset)}`)}
                                </Button>
                            ))}
                        </div>

                        {/* Date picker */}
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="outline" size="sm" className="h-8 gap-2 rounded-lg px-3 text-xs">
                                    <CalendarIcon className="h-3.5 w-3.5" />
                                    {dateRange?.start ? (
                                        dateRange.end ? (
                                            <>{format(dateRange.start, "dd MMM", { locale })} – {format(dateRange.end, "dd MMM", { locale })}</>
                                        ) : format(dateRange.start, "dd MMM", { locale })
                                    ) : <span>{t('taskBoard.chooseDate')}</span>}
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                    initialFocus
                                    mode="range"
                                    defaultMonth={dateRange?.start}
                                    selected={{ from: dateRange.start, to: dateRange.end }}
                                    onSelect={(range) => {
                                        if (range?.from) setDateRange({ start: range.from, end: range.to || range.from });
                                    }}
                                    numberOfMonths={2}
                                    disabled={{ after: new Date() }}
                                />
                            </PopoverContent>
                        </Popover>

                        {/* Search */}
                        <div className="relative min-w-[180px] flex-1">
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/70" />
                            <Input
                                type="text"
                                placeholder={t('taskBoard.searchPlaceholder')} aria-label={t('taskBoard.searchPlaceholder')}
                                className="h-8 rounded-lg pl-8 text-xs"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Filters */}
                        {isManager && (
                            <>
                                <Select
                                    value={filterUserId?.toString() || 'all'}
                                    onValueChange={(val) => {
                                        if (val && val !== 'all') { setFilterUserId(parseInt(val, 10)); }
                                        else { setFilterUserId(undefined); }
                                    }}
                                    disabled={filterGroupId !== undefined}
                                >
                                    <SelectTrigger className="h-8 w-[170px] rounded-lg text-xs" aria-label={t('taskBoard.user')}>
                                        <SelectValue placeholder={t('taskBoard.user')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('taskBoard.allUsers')}</SelectItem>
                                        {users?.map(user => (
                                            <SelectItem key={user.id} value={user.id.toString()}>{user.fullname || user.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select
                                    value={filterGroupId?.toString() || 'all'}
                                    onValueChange={(val) => {
                                        if (val && val !== 'all') { setFilterGroupId(parseInt(val, 10)); }
                                        else { setFilterGroupId(undefined); }
                                    }}
                                    disabled={filterUserId !== undefined}
                                >
                                    <SelectTrigger className="h-8 w-[170px] rounded-lg text-xs" aria-label={t('taskBoard.group')}>
                                        <SelectValue placeholder={t('taskBoard.group')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t('taskBoard.allGroups')}</SelectItem>
                                        {groups?.map(group => (
                                            <SelectItem key={group.id} value={group.id.toString()}>{group.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </>
                        )}

                        {(filterUserId !== undefined || filterGroupId !== undefined || searchQuery !== '') && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => { workspace.setFilters({ filterUserId: undefined, filterGroupId: undefined, searchQuery: '' }); }}
                                className="h-8 gap-1.5 text-xs text-muted-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                                {t('taskBoard.clear')}
                            </Button>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-2.5">
                        <SavedViewsDialog views={workspace.views} persisted={workspace.isPersisted} onDelete={workspace.deleteView}
                            onSave={name => workspace.saveView({ ...workspace.filters, name, range: snapshotViewRange(dateRange), showCompleted })}
                            onApply={view => { workspace.setFilters({ searchQuery: view.searchQuery, compact: view.compact, filterUserId: view.filterUserId, filterGroupId: view.filterGroupId }); setDateRange(resolveViewRange(view.range)); setShowCompleted(view.showCompleted); }} />
                        <div className="flex items-center gap-2">
                            <Switch id="compact-board" checked={workspace.filters.compact} onCheckedChange={compact => workspace.setFilters({ compact })} />
                            <Label htmlFor="compact-board" className="cursor-pointer text-xs font-normal text-muted-foreground">{t('boardViews.compact')}</Label>
                        </div>
                        {!workspace.isPersisted && <p role="status" className="text-xs text-muted-foreground">{t('boardViews.storageUnavailable')}</p>}
                        <div className="ml-auto flex items-center gap-2">
                            <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
                            <Label htmlFor="show-completed" className="cursor-pointer whitespace-nowrap text-xs font-normal text-muted-foreground">
                                {t('taskBoard.completed')}
                            </Label>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════════════ CONTENT ══════════════════ */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-4">
                    {/* In progress */}
                    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                        <div className="flex items-center justify-between gap-3 border-b px-5 py-3">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-700 dark:text-sky-400">
                                    <CircleDot className="h-4 w-4" />
                                </span>
                                <h3 className="text-sm font-semibold text-foreground">{t('taskBoard.inProgress')}</h3>
                                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">{activeItems.length}</span>
                            </div>
                            <span className="text-[11px] text-muted-foreground">
                                {t('taskBoard.taskCount', { count: activeItems.length })}
                            </span>
                        </div>
                        {activeItems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <p className="text-sm text-muted-foreground">{t('taskBoard.noActiveTasks')}</p>
                            </div>
                        ) : (
                            <div>
                                {activeItems.map(item => (
                                    <TaskRow
                                        key={`${item.taskId}-${item.instanceDate}`}
                                        item={item}
                                        onStatusChange={handleStatusChange}
                                        onAdminAction={setAdminDialogItem}
                                        compact={compact}
                                        readonly={isTvMode || isGuest}
                                        isUpdating={isItemUpdating(item.taskId, item.instanceDate)}
                                    />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Completed */}
                    {showCompleted && buckets.completed.length > 0 && (
                        <TaskListSection
                            compact={compact}
                            title={t('taskBoard.completed')}
                            items={buckets.completed}
                            onStatusChange={handleStatusChange}
                            onAdminAction={setAdminDialogItem}
                            readonly
                        />
                    )}

                    {showCompleted && buckets.completed.length === 0 && (
                        <div className="rounded-xl border border-dashed py-10 text-center">
                            <p className="text-sm text-muted-foreground">{t('taskBoard.noCompletedTasks')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ FOOTER ══════════════════ */}
            <div className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 py-2 text-[11px] text-muted-foreground">
                <span>{t('taskBoard.totalCount', { count: totalTasks })}</span>
                <span aria-hidden="true">·</span>
                <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5", syncOk ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', syncOk ? 'bg-emerald-500' : 'bg-amber-500', isFetching && 'animate-pulse')} />
                    {!isOnline ? t('taskBoard.offline') : isRefetchError ? t('taskBoard.refreshFailed') : isFetching ? t('taskBoard.refreshing') : t('taskBoard.connected')}
                </span>
                {dataUpdatedAt > 0 && <span>{t('taskBoard.lastSynced', { time: format(dataUpdatedAt, 'HH:mm:ss') })}</span>}
            </div>

            {/* Admin Dialog */}
            <AdminStatusDialog
                item={adminDialogItem}
                open={!!adminDialogItem}
                onOpenChange={(open) => { if (!open) setAdminDialogItem(null); }}
                onConfirm={handleStatusChange}
            />
        </div>
    );
}
