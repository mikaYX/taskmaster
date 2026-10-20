import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    useTodos,
    useCreateTodo,
    useUpdateTodo,
    useClearCompletedTodos,
    useReorderTodos,
    useTodoSummary,
} from '@/hooks/use-todos';
import { cn } from '@/lib/utils';
import { useGroups } from '@/hooks/use-groups';
import { useUsers } from '@/hooks/use-users';
import { useAuthStore } from '@/stores';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import {
    AlertTriangle,
    CalendarClock,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    CircleDot,
    History,
    ListTodo,
    Loader2,
    Lock,
    Plus,
    Search,
    SlidersHorizontal,
    User,
    Users,
} from 'lucide-react';
import type { Todo, TodoPriority, TodoRecurrence } from '@/api/todos';
import { getErrorMessage } from '@/api/http';
import { PRIORITY_DOT, PRIORITY_VALUES, RECURRENCE_VALUES } from './todo-priority';
import { daysUntilDue } from './todo-due';
import { REMIND_OPTIONS, remindToSelect, selectToRemind } from './todo-schedule';
import { parseQuickAdd } from './todo-quick-add';
import { usePublicBranding } from '@/hooks/use-public-branding';
import { Navigate } from 'react-router-dom';
import { TodoEditDialog } from './todo-edit-dialog';
import { TodoItem, type TodoDragProps } from './todo-item';
import { TodoDetailsSheet } from './todo-details-sheet';
import { TodoHistoryDialog } from './todo-history-dialog';
import { TodoReminderSettings } from './todo-reminder-settings';
import { useUndoableDelete } from './use-undoable-delete';
import { toast } from 'sonner';

type TodoScope = 'PRIVATE' | 'COLLECTIVE';
type DueFilter = 'all' | 'overdue' | 'today' | 'week';

function matchesDueFilter(dueDate: string | null, filter: DueFilter) {
    if (filter === 'all') return true;
    if (!dueDate) return false;
    const days = daysUntilDue(dueDate);
    if (filter === 'overdue') return days < 0;
    if (filter === 'today') return days === 0;
    return days >= 0 && days < 7;
}

/** The "n" shortcut must not fire while typing in a field. */
const isTyping = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

function TodosPageContent() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<TodoScope>('PRIVATE');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const [newPriority, setNewPriority] = useState<TodoPriority>('NORMAL');
    const [showOptions, setShowOptions] = useState(false);
    const [newRecurrence, setNewRecurrence] = useState<TodoRecurrence>('NONE');
    const [newNotes, setNewNotes] = useState('');
    const [newDueTime, setNewDueTime] = useState('');
    const [newRemind, setNewRemind] = useState('default');
    const [newAssignee, setNewAssignee] = useState('none');
    const [search, setSearch] = useState('');
    const [dueFilter, setDueFilter] = useState<DueFilter>('all');
    const [mineOnly, setMineOnly] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [detailsId, setDetailsId] = useState<number | null>(null);
    const [dragId, setDragId] = useState<number | null>(null);
    const [overId, setOverId] = useState<number | null>(null);
    const newTitleRef = useRef<HTMLInputElement>(null);

    const role = useAuthStore((state) => state.role);
    const userId = useAuthStore((state) => state.userId);
    // Everyone sees the collective todos of their groups and can tick them; only managers manage them.
    const isManager = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    const canManage = activeTab === 'PRIVATE' || isManager;

    const { data: privateTodos, isLoading: loadingPrivate } = useTodos('PRIVATE');
    const { data: collectiveTodos, isLoading: loadingCollective } = useTodos('COLLECTIVE');
    const todos = activeTab === 'PRIVATE' ? privateTodos : collectiveTodos;
    const isLoading = activeTab === 'PRIVATE' ? loadingPrivate : loadingCollective;
    const { data: groups } = useGroups(isManager);
    const { data: users } = useUsers(false, false, isManager);

    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const clearCompleted = useClearCompletedTodos();
    const reorderTodos = useReorderTodos();
    const { data: summary } = useTodoSummary();
    const { pendingIds, requestDelete } = useUndoableDelete();
    const [todoToEdit, setTodoToEdit] = useState<Todo | null>(null);

    const fail = (fallbackKey: string) => (error: unknown) => toast.error(getErrorMessage(error, t(fallbackKey)));

    // "n" jumps to the new-task field.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'n' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
            if (!newTitleRef.current) return;
            e.preventDefault();
            newTitleRef.current.focus();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, []);

    const resetForm = () => {
        setNewTitle('');
        setNewDueDate('');
        setNewPriority('NORMAL');
        setNewRecurrence('NONE');
        setNewNotes('');
        setNewDueTime('');
        setNewRemind('default');
        setNewAssignee('none');
    };

    const handleAddTodo = (e: React.FormEvent) => {
        e.preventDefault();
        // "Appeler @demain @14h30 !urgent": what the sentence says wins over the fields.
        const quick = parseQuickAdd(newTitle);
        if (!quick.title) return;

        const dueDate = quick.dueDate ?? (newDueDate || undefined);
        const dueTime = dueDate ? (quick.dueTime ?? (newDueTime || undefined)) : undefined;
        const remind = selectToRemind(newRemind);

        createTodo.mutate(
            {
                title: quick.title,
                scope: activeTab,
                dueDate,
                dueTime,
                priority: quick.priority ?? newPriority,
                recurrence: newRecurrence !== 'NONE' ? newRecurrence : undefined,
                description: newNotes.trim() || undefined,
                remindBeforeMinutes: dueDate && remind !== null ? remind : undefined,
                assigneeId: activeTab === 'COLLECTIVE' && newAssignee !== 'none' ? Number(newAssignee) : undefined,
                groupId: activeTab === 'COLLECTIVE' && selectedGroupId !== 'all' ? Number(selectedGroupId) : undefined,
            },
            { onSuccess: resetForm, onError: fail('todos.errors.create') },
        );
    };

    const handleClearCompleted = () => {
        clearCompleted.mutate(activeTab, {
            onSuccess: ({ count }) => toast.success(t('todos.toasts.cleared', { count })),
        });
    };

    const filtersActive = search.trim() !== '' || dueFilter !== 'all' || mineOnly || (activeTab === 'COLLECTIVE' && selectedGroupId !== 'all');

    const visible = useMemo(() => {
        const all = (todos ?? []).filter((t) => !pendingIds.includes(t.id));
        const subtasksOf = new Map<number, Todo[]>();
        for (const t of all) {
            if (t.parentId !== null) subtasksOf.set(t.parentId, [...(subtasksOf.get(t.parentId) ?? []), t]);
        }
        const query = search.trim().toLowerCase();
        const topLevel = all.filter((t) => {
            if (t.parentId !== null) return false;
            if (activeTab === 'COLLECTIVE' && selectedGroupId !== 'all' && t.groupId !== Number(selectedGroupId)) {
                return false;
            }
            if (mineOnly && t.assigneeId !== userId) return false;
            if (!matchesDueFilter(t.dueDate, dueFilter)) return false;
            // A match on a subtask keeps its parent in the list.
            return (
                !query ||
                t.title.toLowerCase().includes(query) ||
                (subtasksOf.get(t.id) ?? []).some((s) => s.title.toLowerCase().includes(query))
            );
        });
        return {
            subtasksOf,
            active: topLevel.filter((t) => !t.isCompleted),
            completed: topLevel.filter((t) => t.isCompleted),
        };
    }, [todos, pendingIds, search, dueFilter, mineOnly, userId, activeTab, selectedGroupId]);

    const openCount = (list?: Todo[]) => (list ?? []).filter((t) => t.parentId === null && !t.isCompleted).length;

    const detailsTodo = detailsId === null ? null : ((todos ?? []).find((t) => t.id === detailsId) ?? null);

    /** Manual order only means something inside one priority, on the unfiltered list. */
    const canReorder = canManage && !filtersActive;

    const moveWithinPriority = (dragged: Todo, target: Todo) => {
        if (dragged.id === target.id || dragged.priority !== target.priority) return;
        const group = visible.active.filter((t) => t.priority === dragged.priority).map((t) => t.id);
        const from = group.indexOf(dragged.id);
        const to = group.indexOf(target.id);
        if (from < 0 || to < 0) return;
        group.splice(from, 1);
        group.splice(to, 0, dragged.id);
        reorderTodos.mutate(group, { onError: fail('todos.errors.reorder') });
    };

    const moveByKeyboard = (todo: Todo, direction: -1 | 1) => {
        const group = visible.active.filter((t) => t.priority === todo.priority);
        const neighbour = group[group.findIndex((t) => t.id === todo.id) + direction];
        if (neighbour) moveWithinPriority(todo, neighbour);
    };

    const dragPropsFor = (todo: Todo): TodoDragProps | undefined => {
        if (!canReorder || todo.isCompleted) return undefined;
        const dragged = visible.active.find((t) => t.id === dragId);
        const sameGroup = dragged !== undefined && dragged.priority === todo.priority;
        return {
            dragging: dragId === todo.id,
            over: overId === todo.id && sameGroup && dragId !== todo.id,
            onDragStart: (e) => {
                setDragId(todo.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(todo.id));
                const row = (e.currentTarget as HTMLElement).closest('[data-todo-row]');
                if (row) e.dataTransfer.setDragImage(row, 16, 16);
            },
            onDragEnd: () => {
                setDragId(null);
                setOverId(null);
            },
            onDragOver: (e) => {
                if (dragId === null || !sameGroup) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setOverId(todo.id);
            },
            onDrop: (e) => {
                e.preventDefault();
                if (dragged && sameGroup) moveWithinPriority(dragged, todo);
                setDragId(null);
                setOverId(null);
            },
            onMove: (direction) => moveByKeyboard(todo, direction),
        };
    };

    const renderItem = (todo: Todo) => (
        <TodoItem
            key={todo.id}
            todo={todo}
            subtasks={visible.subtasksOf.get(todo.id)}
            canManage={canManage}
            currentUserId={userId}
            drag={dragPropsFor(todo)}
            onToggle={(t, checked) =>
                updateTodo.mutate({ id: t.id, dto: { isCompleted: checked } }, { onError: fail('todos.errors.update') })
            }
            onRename={(t, title) => updateTodo.mutate({ id: t.id, dto: { title } })}
            onEdit={setTodoToEdit}
            onDelete={requestDelete}
            onAddSubtask={(parent, title) => createTodo.mutate({ title, parentId: parent.id })}
            onOpenDetails={(t) => setDetailsId(t.id)}
            onTake={(t) =>
                userId !== null &&
                updateTodo.mutate({ id: t.id, dto: { assigneeId: userId } }, { onError: fail('todos.errors.update') })
            }
            onRelease={(t) =>
                updateTodo.mutate({ id: t.id, dto: { assigneeId: null } }, { onError: fail('todos.errors.update') })
            }
        />
    );

    const renderComposer = () => (
        <form
            onSubmit={handleAddTodo}
            className="rounded-xl border bg-card shadow-sm transition-shadow focus-within:border-primary/40 focus-within:shadow-md"
        >
            <div className="flex items-center gap-2 px-3">
                <Plus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Input
                    ref={newTitleRef}
                    placeholder={t('todos.newTaskPlaceholder')}
                    aria-label={t('todos.newTask')}
                    value={newTitle}
                    className="h-12 border-0 bg-transparent px-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
                    onChange={(e) => setNewTitle(e.target.value)}
                />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t bg-muted/30 px-3 py-2">
                <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="date"
                        aria-label={t('todos.dueDate')}
                        value={newDueDate}
                        className="h-8 w-[10.5rem] bg-background pl-8 text-xs"
                        onChange={(e) => setNewDueDate(e.target.value)}
                    />
                </div>
                <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TodoPriority)}>
                    <SelectTrigger size="sm" aria-label={t('todos.priority')} className="h-8 w-[8.5rem] bg-background text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PRIORITY_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                                <span className="flex items-center gap-2">
                                    <span className={cn('h-2 w-2 rounded-full', PRIORITY_DOT[value] ?? 'bg-muted-foreground/40')} />
                                    {t(`todos.priorities.${value}`)}
                                </span>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={showOptions}
                    className={cn('h-8 gap-1.5 text-xs text-muted-foreground', showOptions && 'bg-accent text-foreground')}
                    onClick={() => setShowOptions((v) => !v)}
                >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {t('todos.options.toggle')}
                </Button>
                <span className="ml-auto hidden text-[11px] text-muted-foreground lg:inline">{t('todos.quickAddShort')}</span>
                <Button type="submit" size="sm" className="ml-auto h-8 gap-1.5 lg:ml-0" disabled={createTodo.isPending || !newTitle.trim()}>
                    {createTodo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    {t('todos.add')}
                </Button>
            </div>

            {showOptions && (
                <div className="grid gap-3 border-t p-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="todo-new-recurrence" className="text-xs">{t('todos.dialog.repeat')}</Label>
                        <Select value={newRecurrence} onValueChange={(v) => setNewRecurrence(v as TodoRecurrence)}>
                            <SelectTrigger id="todo-new-recurrence" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {RECURRENCE_VALUES.map((value) => (
                                    <SelectItem key={value} value={value}>
                                        {t(`todos.recurrences.${value}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="todo-new-time" className="text-xs">{t('todos.dialog.dueTime')}</Label>
                        <Input
                            id="todo-new-time"
                            type="time"
                            value={newDueTime}
                            disabled={!newDueDate}
                            onChange={(e) => setNewDueTime(e.target.value)}
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="todo-new-remind" className="text-xs">{t('todos.dialog.remind')}</Label>
                        <Select value={newRemind} onValueChange={setNewRemind} disabled={!newDueDate}>
                            <SelectTrigger id="todo-new-remind" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {REMIND_OPTIONS.map((option) => (
                                    <SelectItem key={option.key} value={remindToSelect(option.value)}>
                                        {t(`todos.remind.${option.key}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    {activeTab === 'COLLECTIVE' && (
                        <div className="space-y-1.5">
                            <Label htmlFor="todo-new-assignee" className="text-xs">{t('todos.dialog.assignee')}</Label>
                            <Select value={newAssignee} onValueChange={setNewAssignee}>
                                <SelectTrigger id="todo-new-assignee" className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">{t('todos.dialog.nobody')}</SelectItem>
                                    {users?.map((u) => (
                                        <SelectItem key={u.id} value={u.id.toString()}>
                                            {u.fullname || u.username}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5 sm:col-span-2">
                        <Label htmlFor="todo-new-notes" className="text-xs">{t('todos.dialog.notes')}</Label>
                        <Textarea
                            id="todo-new-notes"
                            rows={2}
                            maxLength={2000}
                            value={newNotes}
                            onChange={(e) => setNewNotes(e.target.value)}
                        />
                    </div>
                    <p className="text-[11px] text-muted-foreground sm:col-span-2">{t('todos.quickAddHint')}</p>
                </div>
            )}
        </form>
    );

    const renderFilters = () => (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                    type="search"
                    aria-label={t('todos.searchLabel')}
                    placeholder={t('todos.search')}
                    value={search}
                    className="pl-9"
                    onChange={(e) => setSearch(e.target.value)}
                />
            </div>
            <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
                <SelectTrigger aria-label={t('todos.dueFilterLabel')} className="w-full sm:w-44">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">{t('todos.filters.all')}</SelectItem>
                    <SelectItem value="overdue">{t('todos.filters.overdue')}</SelectItem>
                    <SelectItem value="today">{t('todos.filters.today')}</SelectItem>
                    <SelectItem value="week">{t('todos.filters.week')}</SelectItem>
                </SelectContent>
            </Select>
            {activeTab === 'COLLECTIVE' && isManager && (
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                    <SelectTrigger aria-label={t('todos.selectGroup')} className="w-full sm:w-44">
                        <SelectValue placeholder={t('todos.selectGroup')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('todos.wholeSite')}</SelectItem>
                        {groups?.map((g: { id: number; name: string }) => (
                            <SelectItem key={g.id} value={g.id.toString()}>
                                {g.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
            {activeTab === 'COLLECTIVE' && (
                <Button
                    type="button"
                    variant={mineOnly ? 'default' : 'outline'}
                    aria-pressed={mineOnly}
                    className="gap-2"
                    onClick={() => setMineOnly((v) => !v)}
                >
                    <User className="h-4 w-4" />
                    {t('todos.filters.mine')}
                </Button>
            )}
        </div>
    );

    const renderList = () =>
        isLoading ? (
            <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
                <Skeleton className="h-16 w-full rounded-xl" />
            </div>
        ) : (
            <div className="space-y-6">
                {visible.active.length === 0 && visible.completed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-14 text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <ListTodo className="h-7 w-7 text-primary" />
                        </div>
                        <h3 className="text-base font-semibold">{t('todos.emptyTitle')}</h3>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            {canManage ? t('todos.emptyCanAdd') : t('todos.emptyReadOnly')}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">{visible.active.map(renderItem)}</div>
                )}

                {visible.completed.length > 0 && (
                    <Collapsible className="rounded-xl border bg-muted/20">
                        <div className="flex items-center justify-between gap-2 px-4 py-2.5">
                            <CollapsibleTrigger className="group/completed flex flex-1 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                {t('todos.completedSection', { n: visible.completed.length })}
                                <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/completed:rotate-180" />
                            </CollapsibleTrigger>
                            {canManage && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                                    disabled={clearCompleted.isPending}
                                    onClick={handleClearCompleted}
                                >
                                    {t('todos.clearCompleted')}
                                </Button>
                            )}
                        </div>
                        <CollapsibleContent className="space-y-2 px-3 pb-3">{visible.completed.map(renderItem)}</CollapsibleContent>
                    </Collapsible>
                )}
            </div>
        );

    const renderTabContent = () => (
        <div className="space-y-4">
            {canManage && renderComposer()}
            {renderFilters()}
            {renderList()}
        </div>
    );

    const statCards: { key: string; icon: typeof AlertTriangle; value: number; tone: string; active: boolean; onClick: () => void }[] = [
        {
            key: 'overdue',
            icon: AlertTriangle,
            value: summary?.overdue ?? 0,
            tone: 'text-red-600 bg-red-500/10 dark:text-red-400',
            active: dueFilter === 'overdue',
            onClick: () => setDueFilter((f) => (f === 'overdue' ? 'all' : 'overdue')),
        },
        {
            key: 'today',
            icon: CalendarClock,
            value: summary?.dueToday ?? 0,
            tone: 'text-amber-600 bg-amber-500/10 dark:text-amber-400',
            active: dueFilter === 'today',
            onClick: () => setDueFilter((f) => (f === 'today' ? 'all' : 'today')),
        },
        {
            key: 'open',
            icon: CircleDot,
            value: summary?.open ?? 0,
            tone: 'text-primary bg-primary/10',
            active: false,
            onClick: () => {
                setDueFilter('all');
                setMineOnly(false);
                setSearch('');
            },
        },
        {
            key: 'mine',
            icon: User,
            value: summary?.mine ?? 0,
            tone: 'text-violet-600 bg-violet-500/10 dark:text-violet-400',
            active: mineOnly,
            onClick: () => {
                setActiveTab('COLLECTIVE');
                setMineOnly((v) => !v);
            },
        },
    ];

    return (
        <div className="mx-auto w-full max-w-4xl space-y-6 py-4 sm:py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <ListTodo className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('nav.todoList')}</h1>
                        <p className="text-sm text-muted-foreground">{t('todos.subtitle')}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setHistoryOpen(true)}>
                        <History className="h-4 w-4" />
                        {t('todos.history.button')}
                    </Button>
                    <TodoReminderSettings />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {statCards.map(({ key, icon: Icon, value, tone, active, onClick }) => (
                    <button
                        key={key}
                        type="button"
                        aria-pressed={active}
                        onClick={onClick}
                        className={cn(
                            'flex items-center gap-3 rounded-xl border bg-card p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            active && 'border-primary ring-1 ring-primary',
                        )}
                    >
                        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tone)}>
                            <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-xl font-semibold leading-none tabular-nums">{value}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{t(`todos.stats.${key}`)}</span>
                        </span>
                    </button>
                ))}
            </div>

            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TodoScope)} className="gap-4">
                <TabsList className="h-10 w-full sm:w-auto">
                    <TabsTrigger value="PRIVATE" className="gap-2 px-4">
                        <Lock className="h-3.5 w-3.5" />
                        {t('todos.tabs.private')}
                        <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[11px] font-semibold tabular-nums">
                            {openCount(privateTodos)}
                        </span>
                    </TabsTrigger>
                    <TabsTrigger value="COLLECTIVE" className="gap-2 px-4">
                        <Users className="h-3.5 w-3.5" />
                        {t('todos.tabs.collective')}
                        <span className="rounded-full bg-muted-foreground/15 px-1.5 text-[11px] font-semibold tabular-nums">
                            {openCount(collectiveTodos)}
                        </span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="PRIVATE">{renderTabContent()}</TabsContent>
                <TabsContent value="COLLECTIVE">{renderTabContent()}</TabsContent>
            </Tabs>

            <TodoEditDialog
                todo={todoToEdit}
                groups={activeTab === 'COLLECTIVE' ? groups : undefined}
                assignees={activeTab === 'COLLECTIVE' && isManager ? users : undefined}
                saving={updateTodo.isPending}
                onSave={(id, dto) =>
                    updateTodo.mutate({ id, dto }, { onSuccess: () => setTodoToEdit(null), onError: fail('todos.errors.update') })
                }
                onClose={() => setTodoToEdit(null)}
            />

            <TodoDetailsSheet
                todo={detailsTodo}
                currentUserId={userId}
                isManager={isManager}
                onClose={() => setDetailsId(null)}
            />

            <TodoHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} scope={activeTab} />
        </div>
    );
}

export function TodosPage() {
    // Public allowlist: /api/settings is SUPER_ADMIN-only, which hid the page from every other role.
    const { getSettingAsBool, isLoading: isLoadingSettings } = usePublicBranding();
    const isEnabled = getSettingAsBool('addons.todolist.enabled');

    if (isLoadingSettings) {
        return (
            <div className="flex h-[400px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (!isEnabled) {
        return <Navigate to="/" replace />;
    }

    return <TodosPageContent />;
}
