import { useEffect, useMemo, useRef, useState } from 'react';
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo, useClearCompletedTodos } from '@/hooks/use-todos';
import { useGroups } from '@/hooks/use-groups';
import { useAuthStore } from '@/stores';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ChevronDown, ListTodo, Loader2 } from 'lucide-react';
import type { Todo, TodoPriority } from '@/api/todos';
import { PRIORITY_OPTIONS } from './todo-priority';
import { daysUntilDue } from './todo-due';
import { usePublicBranding } from '@/hooks/use-public-branding';
import { Navigate } from 'react-router-dom';
import { TodoEditDialog } from './todo-edit-dialog';
import { TodoItem } from './todo-item';
import { toast } from 'sonner';

const UNDO_DELAY_MS = 5000;

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
    const [activeTab, setActiveTab] = useState<TodoScope>('PRIVATE');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const [newPriority, setNewPriority] = useState<TodoPriority>('NORMAL');
    const [search, setSearch] = useState('');
    const [dueFilter, setDueFilter] = useState<DueFilter>('all');
    const newTitleRef = useRef<HTMLInputElement>(null);

    const role = useAuthStore((state) => state.role);
    // Everyone sees the collective todos of their groups and can tick them; only managers manage them.
    const isManager = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    const canManage = activeTab === 'PRIVATE' || isManager;

    const { data: privateTodos, isLoading: loadingPrivate } = useTodos('PRIVATE');
    const { data: collectiveTodos, isLoading: loadingCollective } = useTodos('COLLECTIVE');
    const todos = activeTab === 'PRIVATE' ? privateTodos : collectiveTodos;
    const isLoading = activeTab === 'PRIVATE' ? loadingPrivate : loadingCollective;
    const { data: groups } = useGroups(isManager);

    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const deleteTodo = useDeleteTodo();
    const clearCompleted = useClearCompletedTodos();
    const [todoToEdit, setTodoToEdit] = useState<Todo | null>(null);
    // Todos hidden while their "Annuler" toast is open; the real DELETE only fires afterwards.
    const [pendingDeleteIds, setPendingDeleteIds] = useState<number[]>([]);

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

    const handleDelete = (todo: Todo) => {
        let undone = false;
        let committed = false;
        const unhide = () => setPendingDeleteIds((ids) => ids.filter((id) => id !== todo.id));
        const commit = () => {
            if (undone || committed) return;
            committed = true;
            deleteTodo.mutate(todo.id, { onSettled: unhide });
        };

        setPendingDeleteIds((ids) => [...ids, todo.id]);
        toast('Tâche supprimée', {
            description: todo.title,
            duration: UNDO_DELAY_MS,
            action: {
                label: 'Annuler',
                onClick: () => {
                    undone = true;
                    unhide();
                },
            },
            onAutoClose: commit,
            onDismiss: commit,
        });
    };

    const handleAddTodo = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        createTodo.mutate(
            {
                title: newTitle.trim(),
                scope: activeTab,
                dueDate: newDueDate || undefined,
                priority: newPriority,
                groupId: activeTab === 'COLLECTIVE' && selectedGroupId !== 'all' ? Number(selectedGroupId) : undefined,
            },
            {
                onSuccess: () => {
                    setNewTitle('');
                    setNewDueDate('');
                    setNewPriority('NORMAL');
                },
            }
        );
    };

    const handleClearCompleted = () => {
        clearCompleted.mutate(activeTab, {
            onSuccess: ({ count }) => toast.success(count > 1 ? `${count} tâches supprimées` : 'Tâche supprimée'),
        });
    };

    const visible = useMemo(() => {
        const all = (todos ?? []).filter((t) => !pendingDeleteIds.includes(t.id));
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
    }, [todos, pendingDeleteIds, search, dueFilter, activeTab, selectedGroupId]);

    const openCount = (list?: Todo[]) => (list ?? []).filter((t) => t.parentId === null && !t.isCompleted).length;

    const renderItem = (todo: Todo) => (
        <TodoItem
            key={todo.id}
            todo={todo}
            subtasks={visible.subtasksOf.get(todo.id)}
            canManage={canManage}
            onToggle={(t, checked) => updateTodo.mutate({ id: t.id, dto: { isCompleted: checked } })}
            onRename={(t, title) => updateTodo.mutate({ id: t.id, dto: { title } })}
            onEdit={setTodoToEdit}
            onDelete={handleDelete}
            onAddSubtask={(parent, title) => createTodo.mutate({ title, parentId: parent.id })}
        />
    );

    const renderTabContent = () => (
        <>
            {canManage && (
                <form onSubmit={handleAddTodo} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                        <Input
                            ref={newTitleRef}
                            placeholder="Nouvelle tâche... (n)"
                            aria-label="Nouvelle tâche"
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                        />
                    </div>
                    <div className="w-full sm:w-48">
                        <Input
                            type="date"
                            aria-label="Échéance"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                        />
                    </div>
                    <div className="w-full sm:w-36">
                        <Select value={newPriority} onValueChange={(v) => setNewPriority(v as TodoPriority)}>
                            <SelectTrigger aria-label="Priorité">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {PRIORITY_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value}>
                                        {o.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button type="submit" className="w-full sm:w-auto gap-2" disabled={createTodo.isPending || !newTitle.trim()}>
                        <Plus className="h-4 w-4" />
                        Ajouter
                    </Button>
                </form>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
                <Input
                    type="search"
                    aria-label="Rechercher une tâche"
                    placeholder="Rechercher..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="flex-1"
                />
                <div className="w-full sm:w-48">
                    <Select value={dueFilter} onValueChange={(v) => setDueFilter(v as DueFilter)}>
                        <SelectTrigger aria-label="Filtrer par échéance">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Toutes les échéances</SelectItem>
                            <SelectItem value="overdue">En retard</SelectItem>
                            <SelectItem value="today">Aujourd&apos;hui</SelectItem>
                            <SelectItem value="week">Cette semaine</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
            ) : (
                <div className="space-y-6">
                    {visible.active.length === 0 && visible.completed.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                <ListTodo className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-lg font-medium">Aucune tâche</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                {canManage ? 'Ajoutez-en une ci-dessus pour commencer.' : 'Rien à faire pour le moment.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">{visible.active.map(renderItem)}</div>
                    )}

                    {visible.completed.length > 0 && (
                        <Collapsible className="mt-8 border rounded-lg p-4 bg-muted/20">
                            <div className="flex items-center justify-between gap-2">
                                <CollapsibleTrigger className="flex items-center flex-1 justify-between text-sm font-medium hover:text-primary transition-colors">
                                    <span className="text-muted-foreground">
                                        Terminées ces dernières 24 h ({visible.completed.length})
                                    </span>
                                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                </CollapsibleTrigger>
                                {canManage && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-muted-foreground hover:text-destructive"
                                        disabled={clearCompleted.isPending}
                                        onClick={handleClearCompleted}
                                    >
                                        Tout supprimer
                                    </Button>
                                )}
                            </div>
                            <CollapsibleContent className="space-y-3 mt-4">{visible.completed.map(renderItem)}</CollapsibleContent>
                        </Collapsible>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div className="container max-w-4xl py-6 space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Todo List</h1>
                <p className="text-muted-foreground">Vos tâches personnelles et collectives</p>
            </div>

            <Tabs value={activeTab} onValueChange={(val) => setActiveTab(val as TodoScope)}>
                <TabsList className="mb-6">
                    <TabsTrigger value="PRIVATE">Privé ({openCount(privateTodos)})</TabsTrigger>
                    <TabsTrigger value="COLLECTIVE">Collectif ({openCount(collectiveTodos)})</TabsTrigger>
                </TabsList>

                <TabsContent value="PRIVATE" className="space-y-6">
                    {renderTabContent()}
                </TabsContent>

                <TabsContent value="COLLECTIVE" className="space-y-6">
                    {isManager && (
                        <div className="w-full sm:w-64">
                            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sélectionner un groupe..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Tout le site</SelectItem>
                                    {groups?.map((g: { id: number; name: string }) => (
                                        <SelectItem key={g.id} value={g.id.toString()}>
                                            {g.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {renderTabContent()}
                </TabsContent>
            </Tabs>

            <TodoEditDialog
                todo={todoToEdit}
                groups={activeTab === 'COLLECTIVE' ? groups : undefined}
                saving={updateTodo.isPending}
                onSave={(id, dto) => updateTodo.mutate({ id, dto }, { onSuccess: () => setTodoToEdit(null) })}
                onClose={() => setTodoToEdit(null)}
            />
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
