import { useState, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
    Plus,
    Archive,
    ClipboardList,
    ChevronUp,
    ChevronDown,
    ChevronsUpDown,
    Search,
    CheckCircle2,
    UserX,
    PauseCircle,
    Repeat,
    User,
    Users,
    X,
    Power,
    PowerOff,
    Trash2,
    Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { CalendarClock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useTasks } from '@/hooks/use-tasks';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useIsAdminOrManager, useIsGuest } from '@/stores/auth-store';
import { TaskActions } from './components/task-actions';
// import { TaskFormDialog } from './components/task-form-dialog'; // REMOVED
import { BulkDelegationDialog } from './components/bulk-delegation-dialog';
import { BulkDeactivateDialog } from './components/bulk-deactivate-dialog';
import { BulkDeleteDialog } from './components/bulk-delete-dialog';
import { runBulkTaskAction } from './components/run-bulk-task-action';
import { tasksApi } from '@/api/tasks';
import { toast } from 'sonner';
import { TaskAssignmentsSheet } from './components/task-assignments-sheet';
import { TaskDelegationsSheet } from './components/task-delegations-sheet';
import type { Task } from '@/api/types';

import { PERIODICITY_TONE } from './task-style';



/**
 * Tasks Management Page.
 * 
 * Premium Admin Pattern:
 * - Header Section with title, description, CTA
 * - Card-wrapped Table with filter toggle
 * - Dropdown actions per row
 * - Dialog for create/edit
 * - Sheet for assignments
 */
export function TasksPage() {
    const { t } = useTranslation();
    const isManager = useIsAdminOrManager();
    const isGuest = useIsGuest();

    const [showInactive, setShowInactive] = useState(false);
    const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);

    const { data: tasks, isLoading } = useTasks(showInactive, filterUserId, filterGroupId);

    const { data: users } = useUsers();
    const { data: groups } = useGroups();

    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: keyof Task | 'assignments'; direction: 'asc' | 'desc' } | null>(null);

    const navigate = useNavigate();

    const [taskToAssign, setTaskToAssign] = useState<Task | undefined>(undefined);
    const [taskToDelegate, setTaskToDelegate] = useState<Task | undefined>(undefined);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
    const [bulkOpen, setBulkOpen] = useState<'delegate' | 'deactivate' | 'delete' | null>(null);
    const queryClient = useQueryClient();

    const handleEdit = (task: Task) => {
        navigate(`/task-definitions/${task.id}`);
    };

    const handleManageAssignments = (task: Task) => {
        setTaskToAssign(task);
    };

    const handleManageDelegations = (task: Task) => {
        setTaskToDelegate(task);
    };

    const handleCreate = () => {
        navigate('/task-definitions/new');
    };

    const processedTasks = useMemo(() => {
        if (!tasks) return undefined;

        let result = tasks.filter(task =>
            task.name.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (sortConfig) {
            result = [...result].sort((a, b) => {
                if (sortConfig.key === 'assignments') {
                    const aCount = (a.assignedUserIds?.length || 0) + (a.assignedGroupIds?.length || 0);
                    const bCount = (b.assignedUserIds?.length || 0) + (b.assignedGroupIds?.length || 0);
                    return sortConfig.direction === 'asc' ? aCount - bCount : bCount - aCount;
                }

                if (sortConfig.key === 'isActive') {
                    const aActive = a.isActive ? 1 : 0;
                    const bActive = b.isActive ? 1 : 0;
                    return sortConfig.direction === 'asc' ? aActive - bActive : bActive - aActive;
                }

                const aVal = String(a[sortConfig.key as keyof Task] || '').toLowerCase();
                const bVal = String(b[sortConfig.key as keyof Task] || '').toLowerCase();
                if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return result;
    }, [tasks, searchQuery, sortConfig]);

    const handleSort = (key: keyof Task | 'assignments') => {
        setSortConfig(current => {
            if (current?.key === key) {
                if (current.direction === 'asc') return { key, direction: 'desc' };
                return null;
            }
            return { key, direction: 'asc' };
        });
    };

    const renderSortIcon = (columnKey: string) => {
        if (sortConfig?.key !== columnKey) return null;
        return sortConfig.direction === 'asc' ? <ChevronUp className="ml-1 h-3 w-3 inline" /> : <ChevronDown className="ml-1 h-3 w-3 inline" />;
    };

    // Count stats
    // Selection only counts what is still listed: a filter or a search must not delegate hidden tasks.
    const selectable = isManager && !isGuest;
    const selectedTasks = (processedTasks ?? []).filter(task => selectedIds.has(task.id));
    const allSelected = !!processedTasks?.length && selectedTasks.length === processedTasks.length;
    const activeSelected = selectedTasks.filter(task => task.isActive);
    const inactiveSelected = selectedTasks.filter(task => !task.isActive);
    const [reactivating, setReactivating] = useState(false);
    // Like the per-task action, reactivating is harmless and undoable, so there is no confirmation.
    const reactivateSelected = async () => {
        setReactivating(true);
        const { done, failed } = await runBulkTaskAction(inactiveSelected, tasksApi.reactivate);
        setReactivating(false);
        if (failed.length === 0) toast.success(t('taskList.bulk.reactivated', { count: done }));
        else toast.error(t('taskList.bulk.reactivateFailed', { count: failed.length }), { description: failed.map(item => item.name).join(', ') });
        closeBulk(done > 0);
    };
    const closeBulk = (done: boolean) => {
        setBulkOpen(null);
        if (!done) return;
        setSelectedIds(new Set());
        void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    };
    const toggleTask = (id: number, checked: boolean) =>
        setSelectedIds(current => {
            const next = new Set(current);
            if (checked) next.add(id); else next.delete(id);
            return next;
        });
    const toggleAll = (checked: boolean) => setSelectedIds(checked ? new Set((processedTasks ?? []).map(task => task.id)) : new Set());

    const activeCount = processedTasks?.filter(t => t.isActive).length || 0;
    const inactiveCount = processedTasks?.filter(t => !t.isActive).length || 0;
    const now = new Date();
    const activeDelegationsOf = (task: Task) =>
        task.delegations?.filter(d => new Date(d.startAt) <= now && new Date(d.endAt) > now) || [];
    const unassignedCount = processedTasks?.filter(t =>
        t.isActive && (t.assignedUserIds?.length || 0) === 0 && (t.assignedGroupIds?.length || 0) === 0
    ).length || 0;
    const delegatedCount = processedTasks?.filter(t => activeDelegationsOf(t).length > 0).length || 0;
    const filtersActive = filterUserId !== undefined || filterGroupId !== undefined || searchQuery !== '';

    const stats = [
        { key: 'active', icon: CheckCircle2, value: activeCount, tone: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-400' },
        { key: 'unassigned', icon: UserX, value: unassignedCount, tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-400' },
        { key: 'delegated', icon: CalendarClock, value: delegatedCount, tone: 'text-orange-600 bg-orange-500/10 dark:text-orange-400' },
        ...(showInactive
            ? [{ key: 'inactive', icon: PauseCircle, value: inactiveCount, tone: 'text-muted-foreground bg-muted' }]
            : []),
    ];

    const sortableHead = (key: keyof Task | 'assignments', label: string, className = '') => (
        <TableHead className={cn('h-11 px-4 first:pl-6', className)}>
            <button
                type="button"
                onClick={() => handleSort(key)}
                className={cn(
                    'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground',
                    sortConfig?.key === key && 'text-foreground',
                )}
            >
                {label}
                {sortConfig?.key === key ? renderSortIcon(key) : <ChevronsUpDown className="ml-1 h-3 w-3 opacity-40" />}
            </button>
        </TableHead>
    );

    const renderDelegations = (task: Task) => {
        const activeDelegations = activeDelegationsOf(task);
        if (activeDelegations.length === 0) return null;

        return (
            <TooltipProvider delayDuration={100}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Badge variant="outline" className="mt-1.5 text-orange-600 border-orange-200 bg-orange-50 font-medium cursor-help dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-400" aria-label={t('taskList.delegationsAria', { n: activeDelegations.length })}>
                            <CalendarClock className="h-3 w-3 mr-1" />
                            {activeDelegations.length > 1 ? t('taskList.delegatedMany', { n: activeDelegations.length }) : t('taskList.delegated')}
                        </Badge>
                    </TooltipTrigger>
                    <TooltipContent align="start" className="max-w-sm p-3">
                        <p className="font-semibold text-sm mb-2">{t('taskList.delegationsTitle')}</p>
                        <div className="space-y-1.5">
                            {activeDelegations.map(d => {
                                type DelegationTarget = {
                                    fullname?: string;
                                    username?: string;
                                    user?: { fullname?: string; username?: string };
                                    name?: string;
                                    group?: { name?: string };
                                };
                                type DelegationAny = {
                                    delegatedBy?: DelegationTarget;
                                    targetUsers?: DelegationTarget[];
                                    targetGroups?: DelegationTarget[];
                                };
                                const dAny = d as unknown as DelegationAny;
                                const rawDel = dAny.delegatedBy?.fullname || dAny.delegatedBy?.username || dAny.delegatedBy?.user?.fullname || dAny.delegatedBy?.user?.username || '';
                                const delegator = rawDel.trim() || t('taskList.unknown');

                                const tUsers = (dAny.targetUsers || []).map((tu) => {
                                    const name = tu?.fullname || tu?.username || tu?.user?.fullname || tu?.user?.username || '';
                                    return name.trim();
                                }).filter(Boolean);

                                const tGroups = (dAny.targetGroups || []).map((tg) => {
                                    const name = tg?.name || tg?.group?.name || '';
                                    return name.trim() ? t('taskList.groupSuffix', { name: name.trim() }) : null;
                                }).filter(Boolean);

                                const targetsList = [...tUsers, ...tGroups];
                                const targets = targetsList.length > 0 ? targetsList.join(', ') : t('taskList.noRecipient');

                                const formatOpts: Intl.DateTimeFormatOptions = {
                                    day: '2-digit', month: '2-digit', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit'
                                };
                                // toLocaleString() yields "dd/MM/yyyy HH:mm" in fr-FR (sometimes with " à ", we replace it)
                                const dateCode = getDateLocale().code;
                                const start = new Date(d.startAt).toLocaleString(dateCode, formatOpts).replace(' à ', ' ');
                                const end = new Date(d.endAt).toLocaleString(dateCode, formatOpts).replace(' à ', ' ');

                                return (
                                    <p key={d.id} className="text-xs text-muted-foreground leading-tight">
                                        <Trans
                                            i18nKey="taskList.delegationLine"
                                            values={{ delegator, targets, start, end }}
                                            components={{ b: <span className="font-medium text-foreground" /> }}
                                        />
                                    </p>
                                );
                            })}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-24 pt-4 sm:pt-6">
            {/* ========== HEADER ========== */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ClipboardList className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('nav.tasks')}</h1>
                        <p className="text-sm text-muted-foreground">{t('tasks.description')}</p>
                    </div>
                </div>
                {!isGuest && (
                    <div className="flex gap-2">
                        <Button variant="outline" className="gap-2" onClick={() => navigate('/task-definitions/archive')}>
                            <Archive className="h-4 w-4" />
                            {t('taskList.archiveLink')}
                        </Button>
                        <Button onClick={handleCreate} className="gap-2 shadow-sm">
                            <Plus className="h-4 w-4" />
                            {t('tasks.addTask')}
                        </Button>
                    </div>
                )}
            </div>

            {/* ========== STATS ========== */}
            <div className={cn('grid grid-cols-2 gap-3', stats.length === 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')}>
                {stats.map(({ key, icon: Icon, value, tone }) => (
                    <div key={key} className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
                            <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-xl font-semibold leading-none tabular-nums">
                                {isLoading ? '–' : value}
                            </span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{t(`taskList.stats.${key}`)}</span>
                        </span>
                    </div>
                ))}
            </div>

            {/* ========== TOOLBAR ========== */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder={t('taskList.searchPlaceholder')}
                        aria-label={t('taskList.searchPlaceholder')}
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                {isManager && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                        <Select
                            value={filterUserId?.toString() || 'all'}
                            onValueChange={(val) => {
                                if (val && val !== 'all') {
                                    setFilterUserId(parseInt(val, 10));
                                    setFilterGroupId(undefined);
                                } else {
                                    setFilterUserId(undefined);
                                }
                            }}
                            disabled={filterGroupId !== undefined}
                        >
                            <SelectTrigger className="w-full sm:w-[180px]" aria-label={t('taskList.filterUser')}>
                                <SelectValue placeholder={t('taskList.filterUser')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('taskList.allUsers')}</SelectItem>
                                {users?.map(user => (
                                    <SelectItem key={user.id} value={user.id.toString()}>
                                        {user.fullname || user.username}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <Select
                            value={filterGroupId?.toString() || 'all'}
                            onValueChange={(val) => {
                                if (val && val !== 'all') {
                                    setFilterGroupId(parseInt(val, 10));
                                    setFilterUserId(undefined);
                                } else {
                                    setFilterGroupId(undefined);
                                }
                            }}
                            disabled={filterUserId !== undefined}
                        >
                            <SelectTrigger className="w-full sm:w-[180px]" aria-label={t('taskList.filterGroup')}>
                                <SelectValue placeholder={t('taskList.filterGroup')} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{t('taskList.allGroups')}</SelectItem>
                                {groups?.map(group => (
                                    <SelectItem key={group.id} value={group.id.toString()}>
                                        {group.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 lg:justify-start">
                    <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                        <Switch
                            id="show-inactive"
                            checked={showInactive}
                            onCheckedChange={setShowInactive}
                        />
                        <Label htmlFor="show-inactive" className="cursor-pointer whitespace-nowrap text-sm font-normal text-muted-foreground">
                            {t('taskList.showInactive')}
                        </Label>
                    </div>
                    {filtersActive && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                setFilterUserId(undefined);
                                setFilterGroupId(undefined);
                                setSearchQuery('');
                            }}
                            className="gap-1.5 text-muted-foreground"
                        >
                            <X className="h-3.5 w-3.5" />
                            {t('taskList.clear')}
                        </Button>
                    )}
                </div>
            </div>

            {/* ========== LIST ========== */}
            {selectable && selectedTasks.length > 0 && (
                <div role="region" aria-label={t('taskDelegations.bulk.selectedCount', { count: selectedTasks.length })} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5">
                    <span className="text-sm font-medium">{t('taskDelegations.bulk.selectedCount', { count: selectedTasks.length })}</span>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                            {t('taskDelegations.bulk.clear')}
                        </Button>
                        <Button size="sm" variant="outline" className="gap-2" onClick={() => setBulkOpen('delegate')}>
                            <CalendarClock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                            {t('taskDelegations.bulk.action')}
                        </Button>
                        {activeSelected.length > 0 && (
                            <Button size="sm" variant="outline" className="gap-2 text-amber-700 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400" onClick={() => setBulkOpen('deactivate')}>
                                <PowerOff className="h-4 w-4 text-current" />
                                {t('taskList.bulk.deactivate')}
                            </Button>
                        )}
                        {inactiveSelected.length > 0 && (
                            <Button size="sm" variant="outline" className="gap-2 text-emerald-700 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-400" disabled={reactivating} onClick={() => void reactivateSelected()}>
                                {reactivating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4 text-current" />}
                                {t('taskList.bulk.reactivate')}
                            </Button>
                        )}
                        <Button size="sm" variant="outline" className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setBulkOpen('delete')}>
                            <Trash2 className="h-4 w-4 text-current" />
                            {t('taskList.bulk.delete')}
                        </Button>
                    </div>
                </div>
            )}

            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                {isLoading ? (
                    <div className="space-y-4 p-6">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="flex items-center gap-4">
                                <Skeleton className="h-10 w-10 rounded-xl" />
                                <div className="flex-1 space-y-2">
                                    <Skeleton className="h-4 w-48" />
                                    <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-6 w-20 rounded-full" />
                            </div>
                        ))}
                    </div>
                ) : tasks?.length === 0 ? (
                    /* ========== EMPTY STATE ========== */
                    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <ClipboardList className="h-7 w-7 text-primary" />
                        </div>
                        <h3 className="text-lg font-semibold">{t('taskList.emptyTitle')}</h3>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {t('taskList.emptyBody')}
                        </p>
                        {!isGuest && (
                            <Button className="mt-6 gap-2" onClick={handleCreate}>
                                <Plus className="h-4 w-4" />
                                {t('tasks.addTask')}
                            </Button>
                        )}
                    </div>
                ) : processedTasks?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
                        <Search className="mb-3 h-8 w-8 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">{t('taskList.noMatch')}</p>
                    </div>
                ) : (
                    /* ========== TABLE ========== */
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/40 hover:bg-muted/40">
                                {selectable && (
                                    <TableHead className="h-11 w-10 pl-6 pr-0">
                                        <Checkbox
                                            checked={allSelected ? true : selectedTasks.length > 0 ? 'indeterminate' : false}
                                            onCheckedChange={checked => toggleAll(checked === true)}
                                            aria-label={t('taskDelegations.bulk.selectAll')}
                                        />
                                    </TableHead>
                                )}
                                {sortableHead('name', t('taskList.columns.name'))}
                                {sortableHead('periodicity', t('taskList.columns.periodicity'), 'hidden md:table-cell')}
                                {sortableHead('assignments', t('taskList.columns.assignments'), 'hidden lg:table-cell')}
                                {sortableHead('isActive', t('taskList.columns.status'))}
                                <TableHead className="w-[60px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {processedTasks?.map((task) => {
                                const periodicity = (task.periodicity || 'daily').toLowerCase();
                                const users = task.assignedUserIds?.length || 0;
                                const groupsCount = task.assignedGroupIds?.length || 0;
                                return (
                                    <TableRow
                                        key={task.id}
                                        className={cn(
                                            'group cursor-pointer transition-colors hover:bg-muted/40',
                                            !task.isActive && 'bg-muted/20 opacity-60',
                                        )}
                                        onClick={(e) => {
                                            // The row opens the task; buttons, menus and tooltips inside keep their own click.
                                            // Clicks from portals (menus, dialogs) bubble through React too: only clicks really inside the row count.
                                            const target = e.target as HTMLElement;
                                            if (!e.currentTarget.contains(target) || target.closest('button, a, .cursor-help')) return;
                                            handleEdit(task);
                                        }}
                                    >
                                        {selectable && (
                                            <TableCell className="w-10 py-3.5 pl-6 pr-0">
                                                <Checkbox
                                                    checked={selectedIds.has(task.id)}
                                                    onCheckedChange={checked => toggleTask(task.id, checked === true)}
                                                    aria-label={t('taskDelegations.bulk.selectTask', { name: task.name })}
                                                />
                                            </TableCell>
                                        )}
                                        <TableCell className={cn('whitespace-normal py-3.5 pr-4', selectable ? 'pl-4' : 'pl-6')}>
                                            <div className="flex items-center gap-3">
                                                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', PERIODICITY_TONE[periodicity] ?? PERIODICITY_TONE.custom)}>
                                                    <ClipboardList className="h-4 w-4" />
                                                </div>
                                                <div className="min-w-0">
                                                    <span className="block break-words font-medium group-hover:text-primary">{task.name}</span>
                                                    {task.description && (
                                                        <p className="line-clamp-1 max-w-md text-xs text-muted-foreground">
                                                            {task.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden whitespace-normal px-4 py-3.5 md:table-cell">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', PERIODICITY_TONE[periodicity] ?? PERIODICITY_TONE.custom)}>
                                                    <Repeat className="h-3 w-3" />
                                                    {t(`taskWizard.periodicities.${periodicity}.label`, { defaultValue: task.periodicity || 'DAILY' })}
                                                </span>
                                                {task.skipWeekends && (
                                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        {t('taskList.skipWeekends')}
                                                    </span>
                                                )}
                                                {task.skipHolidays && (
                                                    <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                                                        {t('taskList.skipHolidays')}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden px-4 py-3.5 lg:table-cell">
                                            <div className="flex flex-wrap gap-1.5">
                                                {users > 0 && (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs">
                                                        <User className="h-3 w-3" />
                                                        {t('taskList.userCount', { n: users })}
                                                    </span>
                                                )}
                                                {groupsCount > 0 && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                                                        <Users className="h-3 w-3" />
                                                        {t('taskList.groupCount', { n: groupsCount })}
                                                    </span>
                                                )}
                                                {users === 0 && groupsCount === 0 && (
                                                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                                        <UserX className="h-3 w-3" />
                                                        {t('taskList.noAssignments')}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="px-4 py-3.5">
                                            <span
                                                className={cn(
                                                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
                                                    task.isActive
                                                        ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                                                        : 'bg-muted text-muted-foreground',
                                                )}
                                            >
                                                <span className={cn('h-1.5 w-1.5 rounded-full', task.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/60')} />
                                                {task.isActive ? t('taskList.active') : t('taskList.inactive')}
                                            </span>
                                            {renderDelegations(task)}
                                        </TableCell>
                                        <TableCell className="py-3.5 pr-4 text-right">
                                            {!isGuest && (
                                                <TaskActions
                                                    task={task}
                                                    onEdit={handleEdit}
                                                    onManageAssignments={handleManageAssignments}
                                                    onManageDelegations={handleManageDelegations}
                                                />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* ========== DIALOGS & SHEETS ========== */}
            {bulkOpen === 'delegate' && <BulkDelegationDialog tasks={selectedTasks} open onClose={closeBulk} />}
            {bulkOpen === 'deactivate' && <BulkDeactivateDialog tasks={activeSelected} open onClose={closeBulk} />}
            {bulkOpen === 'delete' && <BulkDeleteDialog tasks={selectedTasks} open onClose={closeBulk} />}
            <TaskAssignmentsSheet
                task={tasks?.find((t) => t.id === taskToAssign?.id) || taskToAssign}
                open={!!taskToAssign}
                onOpenChange={(open) => !open && setTaskToAssign(undefined)}
            />
            <TaskDelegationsSheet
                task={tasks?.find((t) => t.id === taskToDelegate?.id) || taskToDelegate}
                open={!!taskToDelegate}
                onOpenChange={(open) => !open && setTaskToDelegate(undefined)}
            />
        </div>
    );
}
