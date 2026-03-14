import { useState } from 'react';
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo } from '@/hooks/use-todos';
import { useGroups } from '@/hooks/use-groups';
import { useAuthStore } from '@/stores';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Trash2, Plus, ChevronDown, ListTodo, Loader2 } from 'lucide-react';
import type { Todo } from '@/api/todos';
import { useSettings } from '@/features/settings/hooks/use-settings';
import { Navigate } from 'react-router-dom';

type TodoScope = 'PRIVATE' | 'COLLECTIVE';

function TodosPageContent() {
    const [activeTab, setActiveTab] = useState<TodoScope>('PRIVATE');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');

    const role = useAuthStore((state) => state.role);
    const canViewCollective = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';

    const { data: todos, isLoading } = useTodos(activeTab);
    const { data: groups } = useGroups();

    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const deleteTodo = useDeleteTodo();

    const handleAddTodo = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        createTodo.mutate(
            {
                title: newTitle.trim(),
                scope: activeTab,
                dueDate: newDueDate || undefined,
                groupId: activeTab === 'COLLECTIVE' && selectedGroupId !== 'all' ? Number(selectedGroupId) : undefined,
            },
            {
                onSuccess: () => {
                    setNewTitle('');
                    setNewDueDate('');
                },
            }
        );
    };

    const filteredTodos = todos?.filter((todo: Todo) => {
        if (activeTab === 'COLLECTIVE' && selectedGroupId !== 'all') {
            return todo.groupId === Number(selectedGroupId);
        }
        return true;
    });

    const activeTodos = filteredTodos?.filter((t: Todo) => !t.isCompleted) || [];
    const completedTodos = filteredTodos?.filter((t: Todo) => t.isCompleted) || [];

    const isPastDue = (dueDate: string | null) => {
        if (!dueDate) return false;
        return new Date(dueDate) < new Date();
    };

    const renderTodoItem = (todo: Todo) => (
        <div
            key={todo.id}
            className="group flex items-center justify-between gap-3 p-3 rounded-lg border bg-card text-card-foreground shadow-sm hover:bg-accent/50 transition-colors"
        >
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <Checkbox
                    checked={todo.isCompleted}
                    onCheckedChange={(checked) => {
                        updateTodo.mutate({ id: todo.id, dto: { isCompleted: checked as boolean } });
                    }}
                />
                <div className="flex flex-col min-w-0">
                    <span className={`text-sm font-medium ${todo.isCompleted ? 'line-through text-muted-foreground' : ''} truncate`}>
                        {todo.title}
                    </span>
                    {todo.dueDate && (
                        <div className="mt-1">
                            <Badge variant={isPastDue(todo.dueDate) && !todo.isCompleted ? 'destructive' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4">
                                {new Date(todo.dueDate).toLocaleDateString()}
                            </Badge>
                        </div>
                    )}
                </div>
            </div>
            <Button
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => deleteTodo.mutate(todo.id)}
            >
                <Trash2 className="h-4 w-4" />
            </Button>
        </div>
    );

    const renderTabContent = () => (
        <>
            <form onSubmit={handleAddTodo} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 w-full">
                    <Input
                        placeholder="Nouvelle tâche..."
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                    />
                </div>
                <div className="w-full sm:w-48">
                    <Input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => setNewDueDate(e.target.value)}
                    />
                </div>
                <Button type="submit" className="w-full sm:w-auto gap-2" disabled={createTodo.isPending || !newTitle.trim()}>
                    <Plus className="h-4 w-4" />
                    Ajouter
                </Button>
            </form>

            {isLoading ? (
                <div className="space-y-3">
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                    <Skeleton className="h-14 w-full" />
                </div>
            ) : (
                <div className="space-y-6">
                    {activeTodos.length === 0 && completedTodos.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center border rounded-lg border-dashed">
                            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                <ListTodo className="h-6 w-6 text-primary" />
                            </div>
                            <h3 className="text-lg font-medium">Aucune tâche</h3>
                            <p className="text-sm text-muted-foreground mt-1">Ajoutez-en une ci-dessus pour commencer.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {activeTodos.map(renderTodoItem)}
                        </div>
                    )}

                    {completedTodos.length > 0 && (
                        <Collapsible className="mt-8 border rounded-lg p-4 bg-muted/20">
                            <CollapsibleTrigger className="flex items-center w-full justify-between text-sm font-medium hover:text-primary transition-colors">
                                <span className="text-muted-foreground">Terminées ({completedTodos.length})</span>
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="space-y-3 mt-4">
                                {completedTodos.map(renderTodoItem)}
                            </CollapsibleContent>
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
                    <TabsTrigger value="PRIVATE">Privé</TabsTrigger>
                    {canViewCollective && <TabsTrigger value="COLLECTIVE">Collectif</TabsTrigger>}
                </TabsList>

                <TabsContent value="PRIVATE" className="space-y-6">
                    {renderTabContent()}
                </TabsContent>

                {canViewCollective && (
                    <TabsContent value="COLLECTIVE" className="space-y-6">
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
                        {renderTabContent()}
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}

export function TodosPage() {
    const { getSettingAsBool, isLoading: isLoadingSettings } = useSettings();
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
