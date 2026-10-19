import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ListPlus, Pencil, Repeat, Trash2 } from 'lucide-react';
import type { Todo } from '@/api/todos';
import { describeDue } from './todo-due';
import { PRIORITY_DOT, priorityLabel } from './todo-priority';

export interface TodoItemActions {
    onToggle: (todo: Todo, checked: boolean) => void;
    onRename: (todo: Todo, title: string) => void;
    onEdit: (todo: Todo) => void;
    onDelete: (todo: Todo) => void;
    onAddSubtask: (parent: Todo, title: string) => void;
}

interface TodoItemProps extends TodoItemActions {
    todo: Todo;
    subtasks?: Todo[];
    /** Rename, edit, delete and add subtasks; ticking is open to everyone who sees the todo. */
    canManage: boolean;
}

const ACTION_BUTTON =
    'sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-8 w-8 text-muted-foreground';

export function TodoItem({ todo, subtasks = [], canManage, ...actions }: TodoItemProps) {
    const [expanded, setExpanded] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [newSubtask, setNewSubtask] = useState('');

    const isSubtask = todo.parentId !== null;
    const done = subtasks.filter((s) => s.isCompleted).length;
    const due = todo.dueDate ? describeDue(todo.dueDate) : null;
    const showSubtasks = !isSubtask && expanded;
    const completer = todo.completedBy?.fullname || todo.completedBy?.username;

    const startRename = () => {
        if (!canManage) return;
        setDraftTitle(todo.title);
        setRenaming(true);
    };

    const commitRename = () => {
        setRenaming(false);
        const title = draftTitle.trim();
        if (title && title !== todo.title) actions.onRename(todo, title);
    };

    const submitSubtask = (e: React.FormEvent) => {
        e.preventDefault();
        const title = newSubtask.trim();
        if (!title) return;
        actions.onAddSubtask(todo, title);
        setNewSubtask('');
    };

    return (
        <div className={isSubtask ? '' : 'rounded-lg border bg-card text-card-foreground shadow-sm'}>
            <div
                className={`group flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/50 ${
                    isSubtask ? 'rounded-md py-2' : 'rounded-lg'
                }`}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Checkbox
                        checked={todo.isCompleted}
                        aria-label={`Terminer « ${todo.title} »`}
                        onCheckedChange={(checked) => actions.onToggle(todo, checked === true)}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                        {renaming ? (
                            <Input
                                autoFocus
                                value={draftTitle}
                                maxLength={255}
                                aria-label="Titre de la tâche"
                                className="h-8"
                                onChange={(e) => setDraftTitle(e.target.value)}
                                onBlur={commitRename}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') commitRename();
                                    if (e.key === 'Escape') setRenaming(false);
                                }}
                            />
                        ) : (
                            <span
                                className={`text-sm font-medium truncate ${
                                    todo.isCompleted ? 'line-through text-muted-foreground' : ''
                                }`}
                                title={canManage ? 'Double-clic pour renommer' : undefined}
                                onDoubleClick={startRename}
                            >
                                {PRIORITY_DOT[todo.priority] && (
                                    <span
                                        role="img"
                                        aria-label={`Priorité ${priorityLabel(todo.priority).toLowerCase()}`}
                                        title={`Priorité ${priorityLabel(todo.priority).toLowerCase()}`}
                                        className={`inline-block h-2 w-2 rounded-full mr-2 align-middle ${PRIORITY_DOT[todo.priority]}`}
                                    />
                                )}
                                {todo.title}
                            </span>
                        )}

                        {todo.description && !renaming && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 whitespace-pre-line">
                                {todo.description}
                            </p>
                        )}

                        {(due || todo.recurrence !== 'NONE' || subtasks.length > 0 || (todo.isCompleted && completer)) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {due && (
                                    <Badge
                                        variant={due.overdue && !todo.isCompleted ? 'destructive' : 'secondary'}
                                        className="text-[10px] px-1.5 py-0 h-4"
                                    >
                                        {due.label}
                                    </Badge>
                                )}
                                {todo.recurrence !== 'NONE' && (
                                    <Repeat className="h-3 w-3 text-muted-foreground" aria-label="Tâche récurrente" />
                                )}
                                {subtasks.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                        {done}/{subtasks.length}
                                    </Badge>
                                )}
                                {todo.isCompleted && completer && (
                                    <span className="text-[10px] text-muted-foreground">par {completer}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center shrink-0">
                    {!isSubtask && (subtasks.length > 0 || canManage) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={expanded ? 'Masquer les sous-tâches' : 'Afficher les sous-tâches'}
                            aria-expanded={expanded}
                            className={`${subtasks.length > 0 ? 'h-8 w-8' : ACTION_BUTTON} text-muted-foreground`}
                            onClick={() => setExpanded((v) => !v)}
                        >
                            {subtasks.length > 0 ? (
                                <ChevronRight className={`h-4 w-4 transition-transform ${expanded ? 'rotate-90' : ''}`} />
                            ) : (
                                <ListPlus className="h-4 w-4" />
                            )}
                        </Button>
                    )}
                    {canManage && (
                        <>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Modifier la tâche"
                                className={`${ACTION_BUTTON} hover:text-primary`}
                                onClick={() => actions.onEdit(todo)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Supprimer la tâche"
                                className={`${ACTION_BUTTON} hover:text-destructive`}
                                onClick={() => actions.onDelete(todo)}
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {showSubtasks && (
                <div className="border-t bg-muted/20 px-3 py-2 pl-10 space-y-1">
                    {subtasks.map((subtask) => (
                        <TodoItem key={subtask.id} todo={subtask} canManage={canManage} {...actions} />
                    ))}
                    {canManage && (
                        <form onSubmit={submitSubtask} className="flex gap-2 pt-1">
                            <Input
                                value={newSubtask}
                                maxLength={255}
                                placeholder="Nouvelle sous-tâche..."
                                aria-label="Nouvelle sous-tâche"
                                className="h-8"
                                onChange={(e) => setNewSubtask(e.target.value)}
                            />
                            <Button type="submit" size="sm" variant="secondary" disabled={!newSubtask.trim()}>
                                Ajouter
                            </Button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}
