import { useState, useMemo } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
import { useNavigate } from 'react-router-dom';
import { Plus, ClipboardList, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
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
import { Label } from '@/components/ui/label';
import { useTasks } from '@/hooks/use-tasks';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useIsAdminOrManager, useIsGuest } from '@/stores/auth-store';
import { TaskActions } from './components/task-actions';
// import { TaskFormDialog } from './components/task-form-dialog'; // REMOVED
import { TaskAssignmentsSheet } from './components/task-assignments-sheet';
import { TaskDelegationsSheet } from './components/task-delegations-sheet';
import type { Task } from '@/api/types';



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
    const activeCount = processedTasks?.filter(t => t.isActive).length || 0;
    const inactiveCount = processedTasks?.filter(t => !t.isActive).length || 0;

    return (
        <div className="space-y-6">
            {/* ========== HEADER SECTION ========== */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{t('nav.tasks')}</h1>
                        <p className="text-muted-foreground">
                            {t('tasks.description')}
                        </p>
                    </div>
                    {!isGuest && (
                        <Button size="lg" onClick={handleCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            {t('tasks.addTask')}
                        </Button>
                    )}
                </div>
            </div>

            {/* ========== CONTENT CARD ========== */}
            <Card className="shadow-sm">
                <CardHeader className="border-b bg-muted/30 py-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            {isLoading
                                ? t('common.loading')
                                : t('taskList.counts', { active: activeCount, inactive: inactiveCount })
                            }
                        </span>
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-4">
                                <div className="relative w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        type="text"
                                        placeholder={t('taskList.searchPlaceholder')}
                                        className="pl-8"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch
                                        id="show-inactive"
                                        checked={showInactive}
                                        onCheckedChange={setShowInactive}
                                    />
                                    <Label htmlFor="show-inactive" className="text-sm text-muted-foreground whitespace-nowrap">
                                        {t('taskList.showInactive')}
                                    </Label>
                                </div>
                            </div>

                            {isManager && (
                                <div className="flex items-center gap-2 border-l pl-4 ml-2">
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
                                        <SelectTrigger className="w-[180px]">
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
                                        <SelectTrigger className="w-[180px]">
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

                            {(filterUserId !== undefined || filterGroupId !== undefined || searchQuery !== '') && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                        setFilterUserId(undefined);
                                        setFilterGroupId(undefined);
                                        setSearchQuery('');
                                    }}
                                    className="text-muted-foreground"
                                >
                                    {t('taskList.clear')}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-3 w-32" />
                                    </div>
                                    <Skeleton className="h-6 w-20" />
                                </div>
                            ))}
                        </div>
                    ) : tasks?.length === 0 ? (
                        /* ========== EMPTY STATE ========== */
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <ClipboardList className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="font-semibold text-lg">{t('taskList.emptyTitle')}</h3>
                            <p className="text-muted-foreground text-sm max-w-sm mt-1">
                                {t('taskList.emptyBody')}
                            </p>
                            <Button className="mt-6" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('tasks.addTask')}
                            </Button>
                        </div>
                    ) : (
                        /* ========== TABLE ========== */
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead
                                        className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6 cursor-pointer select-none"
                                        onClick={() => handleSort('name')}
                                    >
                                        {t('taskList.columns.name')} {renderSortIcon('name')}
                                    </TableHead>
                                    <TableHead
                                        className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6 cursor-pointer select-none"
                                        onClick={() => handleSort('periodicity')}
                                    >
                                        {t('taskList.columns.periodicity')} {renderSortIcon('periodicity')}
                                    </TableHead>
                                    <TableHead
                                        className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6 cursor-pointer select-none"
                                        onClick={() => handleSort('assignments')}
                                    >
                                        {t('taskList.columns.assignments')} {renderSortIcon('assignments')}
                                    </TableHead>
                                    <TableHead
                                        className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6 cursor-pointer select-none"
                                        onClick={() => handleSort('isActive')}
                                    >
                                        {t('taskList.columns.status')} {renderSortIcon('isActive')}
                                    </TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processedTasks?.map((task) => (
                                    <TableRow
                                        key={task.id}
                                        className={`hover:bg-muted/30 transition-colors ${!task.isActive ? 'opacity-50 bg-muted/20' : ''}`}
                                    >
                                        <TableCell className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <ClipboardList className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <span className="font-medium">{task.name}</span>
                                                    {task.description && (
                                                        <p className="text-xs text-muted-foreground line-clamp-1">
                                                            {task.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="uppercase text-[10px] tracking-wider font-semibold">
                                                        {t(`taskWizard.periodicities.${(task.periodicity || 'daily').toLowerCase()}.label`, { defaultValue: task.periodicity || 'DAILY' })}
                                                    </Badge>

                                                </div>

                                                {/* Schedule Rules Tags */}
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {task.skipWeekends && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700">
                                                            {t('taskList.skipWeekends')}
                                                        </span>
                                                    )}
                                                    {task.skipHolidays && (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-700">
                                                            {t('taskList.skipHolidays')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <div className="flex gap-1">
                                                {(task.assignedUserIds?.length || 0) > 0 && (
                                                    <Badge variant="secondary">
                                                        {t('taskList.userCount', { n: task.assignedUserIds?.length })}
                                                    </Badge>
                                                )}
                                                {(task.assignedGroupIds?.length || 0) > 0 && (
                                                    <Badge variant="outline">
                                                        {t('taskList.groupCount', { n: task.assignedGroupIds?.length })}
                                                    </Badge>
                                                )}
                                                {(task.assignedUserIds?.length || 0) === 0 && (task.assignedGroupIds?.length || 0) === 0 && (
                                                    <span className="text-xs text-muted-foreground italic">
                                                        {t('taskList.noAssignments')}
                                                    </span>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            {task.isActive ? (
                                                <Badge variant="default">{t('taskList.active')}</Badge>
                                            ) : (
                                                <Badge variant="secondary">{t('taskList.inactive')}</Badge>
                                            )}
                                            {(() => {
                                                const activeDelegations = task.delegations?.filter(d => new Date(d.startAt) <= new Date() && new Date(d.endAt) > new Date()) || [];
                                                if (activeDelegations.length === 0) return null;

                                                return (
                                                    <TooltipProvider delayDuration={100}>
                                                        <Tooltip>
                                                            <TooltipTrigger asChild>
                                                                <Badge variant="outline" className="mt-2 text-orange-600 border-orange-200 bg-orange-50 font-medium cursor-help" aria-label={t('taskList.delegationsAria', { n: activeDelegations.length })}>
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
                                            })()}
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
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
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* ========== DIALOGS & SHEETS ========== */}
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
