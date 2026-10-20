import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTodos, useCreateTodo, useUpdateTodo } from '@/hooks/use-todos';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, CalendarDays, CheckSquare, Loader2, PartyPopper, Plus, Trash2, User, Users } from 'lucide-react';
import type { Todo } from '@/api/todos';
import { useAuthStore } from '@/stores';
import { cn } from '@/lib/utils';
import { daysUntilDue, describeDue } from '@/features/todos/todo-due';
import { PRIORITY_DOT } from '@/features/todos/todo-priority';
import { parseQuickAdd } from '@/features/todos/todo-quick-add';
import { TodoQuickAddHelp } from '@/features/todos/todo-quick-add-help';
import { TodoAttentionBadge } from '@/features/todos/todo-attention-badge';
import { useUndoableDelete } from '@/features/todos/use-undoable-delete';

type Section = 'overdue' | 'today' | 'upcoming' | 'noDate';
const SECTIONS: Section[] = ['overdue', 'today', 'upcoming', 'noDate'];

const sectionOf = (todo: Todo): Section => {
    if (!todo.dueDate) return 'noDate';
    const days = daysUntilDue(todo.dueDate);
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    return 'upcoming';
};

export function TodoFab() {
    const { t } = useTranslation();
    const role = useAuthStore((state) => state.role);
    const userId = useAuthStore((state) => state.userId);
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
        // Same quick-add words as the full page: "@demain @14h30 !urgente".
        const quick = parseQuickAdd(newTitle);
        if (!quick.title) return;
        const dueDate = quick.dueDate ?? (newDueDate || undefined);

        createTodo.mutate(
            {
                title: quick.title,
                scope: 'PRIVATE',
                dueDate,
                dueTime: dueDate ? quick.dueTime : undefined,
                priority: quick.priority,
            },
            {
                onSuccess: () => {
                    setNewTitle('');
                    setNewDueDate('');
                },
            },
        );
    };

    // Subtasks are shown under their parent on the full page, not as tasks of their own.
    const activeTodos =
        todos?.filter((todo: Todo) => !todo.isCompleted && todo.parentId === null && !pendingIds.includes(todo.id)) ?? [];
    const sections = SECTIONS.map((key) => ({ key, items: activeTodos.filter((todo) => sectionOf(todo) === key) })).filter(
        (section) => section.items.length > 0,
    );

    return (
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
                <Button
                    size="icon"
                    title={t('todos.fab.title')}
                    aria-label={t('todos.fab.title')}
                    className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background transition-all hover:-translate-y-0.5 hover:bg-primary/90 hover:shadow-xl"
                >
                    <CheckSquare className="h-6 w-6" />
                    <TodoAttentionBadge className="absolute -right-1.5 -top-1.5 ring-2 ring-background" />
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
                <SheetHeader className="space-y-0 border-b p-5 text-left">
                    <div className="flex items-center gap-3 pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                            <CheckSquare className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                            <SheetTitle className="text-base">{t('todos.fab.title')}</SheetTitle>
                            <SheetDescription className="text-xs">
                                {t('todos.fab.subtitle', { count: activeTodos.length })}
                            </SheetDescription>
                        </div>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        className="mt-4 h-8 w-full justify-between text-xs"
                        onClick={() => {
                            setIsOpen(false);
                            navigate('/todos');
                        }}
                    >
                        {t('todos.fab.viewAll')}
                        <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                </SheetHeader>

                <form onSubmit={handleAddTodo} className="border-b p-4">
                    <div className="rounded-xl border bg-card shadow-xs transition-shadow focus-within:border-primary/40 focus-within:shadow-md">
                        <div className="flex items-center gap-2 px-3">
                            <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <Input
                                placeholder={t('todos.fab.newPrivate')}
                                aria-label={t('todos.fab.newPrivate')}
                                value={newTitle}
                                className="h-10 border-0 bg-transparent px-1 shadow-none focus-visible:ring-0 dark:bg-transparent"
                                onChange={(e) => setNewTitle(e.target.value)}
                            />
                            <TodoQuickAddHelp />
                        </div>
                        <div className="flex items-center gap-2 border-t bg-muted/30 px-2 py-1.5">
                            <div className="relative">
                                <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <Input
                                    type="date"
                                    aria-label={t('todos.dueDate')}
                                    value={newDueDate}
                                    className="h-7 w-[9.5rem] bg-background pl-7 text-xs"
                                    onChange={(e) => setNewDueDate(e.target.value)}
                                />
                            </div>
                            <Button
                                type="submit"
                                size="sm"
                                className="ml-auto h-7 gap-1 px-2.5 text-xs"
                                disabled={createTodo.isPending || !newTitle.trim()}
                            >
                                {createTodo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                {t('todos.add')}
                            </Button>
                        </div>
                    </div>
                </form>

                <div className="flex-1 overflow-y-auto p-4">
                    {sections.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center">
                            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                <PartyPopper className="h-6 w-6" />
                            </div>
                            <p className="text-sm text-muted-foreground">{t('todos.fab.none')}</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {sections.map((section) => (
                                <section key={section.key} aria-labelledby={`fab-section-${section.key}`}>
                                    <h3
                                        id={`fab-section-${section.key}`}
                                        className={cn(
                                            'mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider',
                                            section.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground',
                                        )}
                                    >
                                        {t(`todos.fab.sections.${section.key}`)}
                                        <span className="rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground">
                                            {section.items.length}
                                        </span>
                                    </h3>
                                    <ul className="space-y-1.5">
                                        {section.items.map((todo) => {
                                            const due = todo.dueDate ? describeDue(todo.dueDate, new Date(), todo.dueTime) : null;
                                            const assignee = todo.assignee ? todo.assignee.fullname || todo.assignee.username : null;
                                            return (
                                                <li
                                                    key={todo.id}
                                                    className="group relative flex items-start gap-3 overflow-hidden rounded-lg border bg-card py-2.5 pl-3.5 pr-2 shadow-xs transition-all hover:border-primary/25 hover:shadow-sm"
                                                >
                                                    {PRIORITY_DOT[todo.priority] && (
                                                        <span
                                                            role="img"
                                                            aria-label={t('todos.priorityAria', {
                                                                priority: t(`todos.priorities.${todo.priority}`).toLowerCase(),
                                                            })}
                                                            className={cn('absolute inset-y-0 left-0 w-1', PRIORITY_DOT[todo.priority])}
                                                        />
                                                    )}
                                                    <Checkbox
                                                        className="mt-0.5 h-[18px] w-[18px] rounded-full"
                                                        checked={todo.isCompleted}
                                                        aria-label={t('todos.item.complete', { title: todo.title })}
                                                        onCheckedChange={(checked) =>
                                                            updateTodo.mutate({ id: todo.id, dto: { isCompleted: checked === true } })
                                                        }
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="break-words text-sm font-medium leading-snug">{todo.title}</p>
                                                        {(due || todo.scope === 'COLLECTIVE') && (
                                                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                                                {due && (
                                                                    <span
                                                                        className={cn(
                                                                            'inline-flex items-center gap-1',
                                                                            due.overdue && 'font-medium text-destructive',
                                                                        )}
                                                                    >
                                                                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                                                        {due.label}
                                                                    </span>
                                                                )}
                                                                {todo.scope === 'COLLECTIVE' && (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <Users className="h-3 w-3" aria-hidden="true" />
                                                                        {t('todos.fab.collective')}
                                                                    </span>
                                                                )}
                                                                {assignee && (
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <User className="h-3 w-3" aria-hidden="true" />
                                                                        {todo.assigneeId === userId ? t('todos.item.assignedToYou') : assignee}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {(todo.scope === 'PRIVATE' || isManager) && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            aria-label={t('todos.item.delete')}
                                                            className="h-7 w-7 shrink-0 text-muted-foreground transition-opacity hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                            onClick={() => requestDelete(todo)}
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    )}
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
