import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTodos, useCreateTodo, useUpdateTodo, useDeleteTodo } from '@/hooks/use-todos';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckSquare, Trash2 } from 'lucide-react';
import type { Todo } from '@/api/todos';

export function TodoFab() {
    const [isOpen, setIsOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const navigate = useNavigate();

    const { data: todos } = useTodos();
    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const deleteTodo = useDeleteTodo();

    const handleAddTodo = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        createTodo.mutate(
            {
                title: newTitle.trim(),
                scope: 'PRIVATE',
                dueDate: newDueDate || undefined,
            },
            {
                onSuccess: () => {
                    setNewTitle('');
                    setNewDueDate('');
                },
            }
        );
    };

    const activeTodos = todos?.filter((t: Todo) => !t.isCompleted) || [];

    const isPastDue = (dueDate: string | null) => {
        if (!dueDate) return false;
        return new Date(dueDate) < new Date();
    };

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button
                    size="icon"
                    title="Mes Todos"
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-110 transition-transform z-50"
                >
                    <CheckSquare className="h-6 w-6" />
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="sm:max-w-sm w-full flex flex-col p-0">
                <SheetHeader className="p-6 border-b text-left space-y-0 flex-row items-center justify-between">
                    <SheetTitle>Mes Todos</SheetTitle>
                    <Button
                        variant="link"
                        size="sm"
                        className="text-muted-foreground hover:text-primary px-0"
                        onClick={() => {
                            setIsOpen(false);
                            navigate('/todos');
                        }}
                    >
                        Voir tout &rarr;
                    </Button>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                    <form onSubmit={handleAddTodo} className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <Input
                                placeholder="Nouvelle tâche privée..."
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                className="flex-1"
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={createTodo.isPending || !newTitle.trim()}
                            >
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                        <Input
                            type="date"
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                            className="text-sm text-muted-foreground"
                        />
                    </form>

                    <div className="h-px bg-border w-full" />

                    <div className="flex flex-col gap-4">
                        {activeTodos.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                Aucune tâche en cours 🎉
                            </div>
                        ) : (
                            activeTodos.map((todo: Todo) => (
                                <div
                                    key={todo.id}
                                    className="group flex items-start gap-3 p-3 rounded-md border bg-card hover:bg-accent/50 transition-colors"
                                >
                                    <Checkbox
                                        className="mt-1"
                                        checked={todo.isCompleted}
                                        onCheckedChange={(checked) => {
                                            updateTodo.mutate({
                                                id: todo.id,
                                                dto: { isCompleted: checked as boolean },
                                            });
                                        }}
                                    />
                                    <div className="flex flex-col min-w-0 flex-1">
                                        <span className="text-sm font-medium leading-none mb-1.5 break-words">
                                            {todo.title}
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {todo.scope === 'COLLECTIVE' && (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                                    Collectif
                                                </Badge>
                                            )}
                                            {todo.dueDate && (
                                                <Badge
                                                    variant={isPastDue(todo.dueDate) ? 'destructive' : 'secondary'}
                                                    className="text-[10px] px-1.5 py-0 h-4"
                                                >
                                                    {new Date(todo.dueDate).toLocaleDateString()}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                        onClick={() => deleteTodo.mutate(todo.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
