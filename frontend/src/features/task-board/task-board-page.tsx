import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Loader2, AlertTriangle, CalendarIcon, Monitor, X, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
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
    const { t } = useTranslation();
    const isManager = useIsAdminOrManager();
    const role = useAuthStore((state) => state.role);
    const isGuest = role === 'GUEST';

    const { isTvMode, setIsTvMode } = useUIStore();
    const [searchQuery, setSearchQuery] = useState('');
    const [filterUserId, setFilterUserId] = useState<number | undefined>(undefined);
    const [filterGroupId, setFilterGroupId] = useState<number | undefined>(undefined);

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
        isUpdating
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

    if (error) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <div className="text-center space-y-2">
                    <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
                    <p className="text-muted-foreground">Erreur de chargement du tableau</p>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1200px] mx-auto px-6 py-6 space-y-5">

            {/* ══════════════════ HERO ══════════════════ */}
            <div className="rounded-2xl bg-secondary/50 border border-border overflow-hidden">

                {/* TV banner */}
                {isTvMode && (
                    <div className="flex items-center justify-between px-6 py-3 bg-muted/50 border-b border-border">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold flex items-center gap-2 text-foreground">
                                <Monitor className="h-4 w-4 text-primary" />
                                MODE AFFICHAGE TV {isGuest && " (LECTURE SEULE)"}
                            </span>
                            <span className="text-xs text-muted-foreground bg-background px-2.5 py-1 rounded-md border border-border">
                                {format(dateRange.start, "dd MMM", { locale: fr })} – {format(dateRange.end, "dd MMM", { locale: fr })}
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
                        <div className="flex items-center justify-between mb-8">
                            <h1 className="text-xl font-bold tracking-tight text-foreground">Tableau de bord</h1>
                            <Button variant="outline" size="sm" className="h-8 gap-2 text-xs" onClick={() => setIsTvMode(true)}>
                                <Monitor className="h-3.5 w-3.5" /> Mode TV
                            </Button>
                        </div>
                    )}

                    {/* Progress ring + Date + Stats */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-14">
                        <ProgressRing percentage={percentage} />
                        <div className="text-center sm:text-left space-y-3">
                            <h2 className="text-2xl font-semibold text-foreground tracking-tight capitalize">
                                {format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}
                            </h2>
                            <div className="flex items-center justify-center sm:justify-start gap-5 text-sm">
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{activeItems.length}</span> en cours</span>
                                </span>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{urgentCount}</span> urgente{urgentCount !== 1 ? 's' : ''}</span>
                                </span>
                                <span className="flex items-center gap-2 text-muted-foreground">
                                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
                                    <span><span className="font-semibold text-foreground">{completedCount}</span> terminées</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* ── Toolbar ── */}
                    {!isTvMode && !isGuest && (
                        <div className="flex flex-wrap items-center gap-2.5 mt-8 pt-5 border-t border-border/60">
                            {/* Presets */}
                            <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
                                {PRESETS.map(preset => (
                                    <Button
                                        key={preset.label}
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
                                        {preset.label}
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
                                                <>{format(dateRange.start, "dd MMM", { locale: fr })} – {format(dateRange.end, "dd MMM", { locale: fr })}</>
                                            ) : format(dateRange.start, "dd MMM", { locale: fr })
                                        ) : <span>Choisir une date</span>}
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
                                    placeholder="Rechercher..."
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
                                            if (val && val !== 'all') { setFilterUserId(parseInt(val, 10)); setFilterGroupId(undefined); }
                                            else { setFilterUserId(undefined); }
                                        }}
                                        disabled={filterGroupId !== undefined}
                                    >
                                        <SelectTrigger className="w-[180px] h-8 text-xs rounded-lg">
                                            <SelectValue placeholder="Utilisateur" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les utilisateurs</SelectItem>
                                            {users?.map(user => (
                                                <SelectItem key={user.id} value={user.id.toString()}>{user.fullname || user.username}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Select
                                        value={filterGroupId?.toString() || 'all'}
                                        onValueChange={(val) => {
                                            if (val && val !== 'all') { setFilterGroupId(parseInt(val, 10)); setFilterUserId(undefined); }
                                            else { setFilterGroupId(undefined); }
                                        }}
                                        disabled={filterUserId !== undefined}
                                    >
                                        <SelectTrigger className="w-[180px] h-8 text-xs rounded-lg">
                                            <SelectValue placeholder="Groupe" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Tous les groupes</SelectItem>
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
                                    onClick={() => { setFilterUserId(undefined); setFilterGroupId(undefined); setSearchQuery(''); }}
                                    className="text-muted-foreground h-8 text-xs"
                                >
                                    Effacer
                                </Button>
                            )}

                            {/* Toggle Terminées */}
                            <div className="flex items-center gap-2.5 ml-auto">
                                <Switch id="show-completed" checked={showCompleted} onCheckedChange={setShowCompleted} />
                                <Label htmlFor="show-completed" className="text-xs cursor-pointer text-muted-foreground whitespace-nowrap">
                                    Terminées
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
                                    readonly={isTvMode || isGuest}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Empty state */}
                    {activeItems.length === 0 && !showCompleted && (
                        <div className="rounded-xl border border-border py-16 text-center bg-card">
                            <p className="text-sm text-muted-foreground">Aucune tâche en cours pour cette période</p>
                        </div>
                    )}

                    {/* Terminées */}
                    {showCompleted && buckets.completed.length > 0 && (
                        <TaskListSection
                            title="✅ Terminées"
                            items={buckets.completed}
                            onStatusChange={handleStatusChange}
                            onAdminAction={setAdminDialogItem}
                            readonly
                        />
                    )}

                    {showCompleted && buckets.completed.length === 0 && (
                        <div className="rounded-xl border border-border py-10 text-center bg-card">
                            <p className="text-sm text-muted-foreground">Aucune tâche terminée pour cette période</p>
                        </div>
                    )}
                </div>
            )}

            {/* ══════════════════ FOOTER ══════════════════ */}
            <div className="text-center text-[11px] text-muted-foreground/60 py-3 tracking-wide">
                {totalTasks} tâche{totalTasks > 1 ? 's' : ''} au total
                <span className="mx-2.5">·</span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Connecté
                </span>
            </div>

            {/* Admin Dialog */}
            <AdminStatusDialog
                item={adminDialogItem}
                open={!!adminDialogItem}
                onOpenChange={(open) => { if (!open) setAdminDialogItem(null); }}
                onConfirm={handleStatusChange}
            />

            {/* Updating overlay */}
            {isUpdating && (
                <div className="fixed inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-50">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            )}
        </div>
    );
}
