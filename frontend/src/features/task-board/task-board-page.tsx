import { useBoardWorkspace } from './use-board-workspace';
import { boardWorkspaceKey, resolveViewRange, snapshotViewRange } from './lib/board-views';
import { SavedViewsDialog } from './components/saved-views-dialog';
import { useSiteStore } from '@/stores/site-store';
import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CalendarIcon, Monitor, X, Search } from 'lucide-react';
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

    const { data: users } = useUsers();
    const { data: groups } = useGroups();

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

    return (
        <div data-density={compact ? "compact" : "comfortable"} className={cn("max-w-[1200px] mx-auto px-6", compact ? "py-3 space-y-3" : "py-6 space-y-5")}>

            {/* ══════════════════ HERO ══════════════════ */}
            <div className="rounded-2xl bg-secondary/50 border border-border overflow-hidden">

                {/* TV banner */}
                {isTvMode && (
                    <div className="flex items-center justify-between px-6 py-3 bg-muted/50 border-b border-border">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold flex items-center gap-2 text-foreground">
                                <Monitor className="h-4 w-4 text-primary" />
                                {t('taskBoard.tvDisplay')} {isGuest && t('taskBoard.readOnly')}
                            </span>
                            <span className="text-xs text-muted-foreground bg-background px-2.5 py-1 rounded-md border border-border">
                                {format(dateRange.start, "dd MMM", { locale })} – {format(dateRange.end, "dd MMM", { locale })}
                            </span>
                        </div>
                        {!isGuest && (
                            <Button variant="ghost" size="sm" onClick={() => setIsTvMode(false)} className="h-8 gap-2">
                                <X className="h-4 w-4" /> Quitter
                            </Button>
                        )}
                    </div>
                )}

                <div className="px-8 pt-6 pb-7">
                    {/* Title (hidden TV mode) */}
                    {!isTvMode && (
                        <div className={cn("flex items-center justify-between", compact ? "mb-3" : "mb-8")}>
                            <h1 className="text-xl font-bold tracking-tight text-foreground">{t('taskBoard.heading')}</h1>
                            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => setIsTvMode(true)}>
                                <Monitor className="h-3.5 w-3.5" /> {t('taskBoard.tvMode')}
                            </Button>
                        </div>
                    )}

                    {/* Progress ring + Date + Stats */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-14">
                        <ProgressRing percentage={percentage} size={compact ? 92 : 150} strokeWidth={compact ? 8 : 12} />
                        <div className="text-center sm:text-left space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground tracking-tight capitalize">
                                {format(new Date(), "EEEE d MMMM yyyy", { locale })}
                            </h2>
                            <div className="flex items-center justify-center sm:justify-start gap-5 text-sm">
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{activeItems.length}</span> {t('taskBoard.runningLabel')}</span>
                                </span>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{urgentCount}</span> {t('taskBoard.urgentLabel', { count: urgentCount })}</span>
                                </span>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{completedCount}</span> {t('taskBoard.completedLabel')}</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Toolbar ── */}
                    {!isTvMode && !isGuest && (
                        <div className={cn("flex flex-wrap items-center gap-2.5 border-t border-border/60", compact ? "mt-3 pt-3" : "mt-8 pt-5")}>
                            {/* Presets */}
                            <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                                {PRESETS.map(preset => (
                                    <Button
                                        key={t(`taskBoard.preset${PRESETS.indexOf(preset)}`)}
                                        variant="ghost"
                                        size="sm"
                                        className={cn(
                                            "text-xs h-7 px-3 rounded-md",
                                            activePresetLabel === preset.label
                                                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
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
                                    <Button variant="outline" size="sm" className="h-8 px-3 text-xs rounded-lg">
                                        <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                                        {dateRange?.start ? (
                                            dateRange.end ? (
                                                <>{format(dateRange.start, "dd MMM", { locale })} – {format(dateRange.end, "dd MMM", { locale })}</>
                                            ) : format(dateRange.start, "dd MMM", { locale })
                                        ) : <span>{t('taskBoard.chooseDate')}</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="end">
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
                            <div className="relative h-8">
                                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground/60" />
                                <Input
                                    type="text"
                                    placeholder={t('taskBoard.searchPlaceholder')} aria-label={t('taskBoard.searchPlaceholder')}
                                    className="pl-8 h-8 w-[150px] text-xs rounded-lg"
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
                                        <SelectTrigger className="w-[180px] h-8 text-xs rounded-lg">
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
                                        <SelectTrigger className="w-[180px] h-8 text-xs rounded-lg">
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
                                    className="text-muted-foreground h-8 text-xs"
                                >
                                    {t('taskBoard.clear')}
                                </Button>
                            )}

                            <SavedViewsDialog views={workspace.views} persisted={workspace.isPersisted} onDelete={workspace.deleteView}
                                onSave={name => workspace.saveView({ ...workspace.filters, name, range: snapshotViewRange(dateRange), showCompleted })}
                                onApply={view => { workspace.setFilters({ searchQuery: view.searchQuery, compact: view.compact, filterUserId: view.filterUserId, filterGroupId: view.filterGroupId }); setDateRange(resolveViewRange(view.range)); setShowCompleted(view.showCompleted); }} />
                            <div className="flex items-center gap-2">
                                <Switch id="compact-board" checked={workspace.filters.compact} onCheckedChange={compact => workspace.setFilters({ compact })} />
                                <Label htmlFor="compact-board" className="text-xs">{t('boardViews.compact')}</Label>
                            </div>
                            {!workspace.isPersisted && <p role="status" className="text-xs text-muted-foreground">{t('boardViews.storageUnavailable')}</p>}
                            {/* Toggle Terminées */}
                            <div className="flex items-center gap-2.5 ml-auto">
                                <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
                                <Label htmlFor="show-completed" className="text-xs cursor-pointer text-muted-foreground whitespace-nowrap">
                                    {t('taskBoard.completed')}
                                </Label>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ══════════════════ CONTENT ══════════════════ */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
            ) : (
                <div className="space-y-4">
                    {/* Groupe unique "En cours" / "In progress" */}
                    <div className="rounded-xl border border-border overflow-hidden bg-card">
                        <div className="px-5 py-3 flex items-center justify-between border-l-[3px] border-l-primary bg-primary/[0.07]">
                            <h3 className="text-[13px] font-semibold text-foreground">{t('taskBoard.inProgress')}</h3>
                            <span className="text-[11px] text-muted-foreground">
                                {t('taskBoard.taskCount', { count: activeItems.length })}
                            </span>
                        </div>
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
                    </div>

                    {/* Empty state */}
                    {activeItems.length === 0 && !showCompleted && (
                        <div className="rounded-xl border border-border py-16 text-center bg-card">
                            <p className="text-sm text-muted-foreground">{t('taskBoard.noActiveTasks')}</p>
                        </div>
                    )}

                    {/* Terminées */}
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
                        <div className="rounded-xl border border-border py-10 text-center bg-card">
                            <p className="text-sm text-muted-foreground">{t('taskBoard.noCompletedTasks')}</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ FOOTER ══════════════════ */}
            <div className="text-center text-[11px] text-muted-foreground/60 py-3 tracking-wide">
                {t('taskBoard.totalCount', { count: totalTasks })}
                <span className="mx-2.5">·</span>
                <span className="inline-flex items-center gap-1.5">
                    <span className={cn('h-1.5 w-1.5 rounded-full', isOnline && !isRefetchError ? 'bg-emerald-500' : 'bg-amber-500')} />
                    {!isOnline ? t('taskBoard.offline') : isRefetchError ? t('taskBoard.refreshFailed') : isFetching ? t('taskBoard.refreshing') : t('taskBoard.connected')}
                    {dataUpdatedAt > 0 && ` · ${t('taskBoard.lastSynced', { time: format(dataUpdatedAt, 'HH:mm:ss') })}`}
                </span>
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
