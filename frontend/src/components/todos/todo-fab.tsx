import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTodos, useCreateTodo, useUpdateTodo } from '@/hooks/use-todos';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Plus, CheckSquare, Trash2 } from 'lucide-react';
import type { Todo } from '@/api/todos';
import { useAuthStore } from '@/stores';
import { describeDue } from '@/features/todos/todo-due';
import { PRIORITY_DOT } from '@/features/todos/todo-priority';
import { TodoAttentionBadge } from '@/features/todos/todo-attention-badge';
import { useUndoableDelete } from '@/features/todos/use-undoable-delete';

export function TodoFab() {
    const { t } = useTranslation();
    const role = useAuthStore((state) => state.role);
    const isManager = role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
    const [isOpen, setIsOpen] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newDueDate, setNewDueDate] = useState('');
    const navigate = useNavigate();

    const { data: todos } = useTodos();
    const createTodo = useCreateTodo();
    const updateTodo = useUpdateTodo();
    const { pendingIds, requestDelete } = useUndoableDelete();

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

    // Subtasks are shown under their parent on the full page, not as tasks of their own.
    const activeTodos = todos?.filter((todo: Todo) => !todo.isCompleted && todo.parentId === null && !pendingIds.includes(todo.id)) || [];

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button
                    size="icon"
                    title={t('todos.fab.title')}
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground hover:scale-110 transition-transform z-50"
                >
                    <CheckSquare className="h-6 w-6" />
                    <TodoAttentionBadge className="absolute -right-1 -top-1" />
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="sm:max-w-sm w-full flex flex-col p-0">
                <SheetHeader className="p-6 border-b text-left space-y-0 flex-row items-center justify-between">
                    <SheetTitle>{t('todos.fab.title')}</SheetTitle>
                    <Button
                        variant="link"
                        size="sm"
                        className="text-muted-foreground hover:text-primary px-0"
                        onClick={() => {
                            setIsOpen(false);
                            navigate('/todos');
                        }}
                    >
                        {t('todos.fab.viewAll')} &rarr;
                    </Button>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
                    <form onSubmit={handleAddTodo} className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            <Input
                                placeholder={t('todos.fab.newPrivate')}
                                aria-label={t('todos.fab.newPrivate')}
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
                            aria-label={t('todos.dueDate')}
                            value={newDueDate}
                            onChange={(e) => setNewDueDate(e.target.value)}
                            className="text-sm text-muted-foreground"
                        />
                    </form>

                    <div className="h-px bg-border w-full" />

                    <div className="flex flex-col gap-4">
                        {activeTodos.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                {t('todos.fab.none')}
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
                                            {PRIORITY_DOT[todo.priority] && (
                                                <span
                                                    role="img"
                                                    aria-label={t('todos.priorityAria', { priority: t(`todos.priorities.${todo.priority}`).toLowerCase() })}
                                                    className={`inline-block h-2 w-2 rounded-full mr-2 align-middle ${PRIORITY_DOT[todo.priority]}`}
                                                />
                                            )}
                                            {todo.title}
                                        </span>
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {todo.scope === 'COLLECTIVE' && (
                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                                    {t('todos.fab.collective')}
                                                </Badge>
                                            )}
                                            {todo.dueDate && (
                                                <Badge
                                                    variant={describeDue(todo.dueDate, new Date(), todo.dueTime).overdue ? 'destructive' : 'secondary'}
                                                    className="text-[10px] px-1.5 py-0 h-4"
                                                >
                                                    {describeDue(todo.dueDate, new Date(), todo.dueTime).label}
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                    {(todo.scope === 'PRIVATE' || isManager) && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            aria-label={t('todos.item.delete')}
                                            className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                                            onClick={() => requestDelete(todo)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
