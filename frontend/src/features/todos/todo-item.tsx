import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, GripVertical, HandHelping, ListPlus, MessageSquare, Pencil, Repeat, Trash2, User, UserMinus } from 'lucide-react';
import type { Todo } from '@/api/todos';
import { describeDue } from './todo-due';
import { PRIORITY_DOT } from './todo-priority';

export interface TodoItemActions {
    onToggle: (todo: Todo, checked: boolean) => void;
    onRename: (todo: Todo, title: string) => void;
    onEdit: (todo: Todo) => void;
    onDelete: (todo: Todo) => void;
    onAddSubtask: (parent: Todo, title: string) => void;
    onOpenDetails?: (todo: Todo) => void;
    /** Collective todos: take it, or give it back. */
    onTake?: (todo: Todo) => void;
    onRelease?: (todo: Todo) => void;
}

/** Native drag and drop state of one row, built by the page. */
export interface TodoDragProps {
    dragging: boolean;
    over: boolean;
    onDragStart: (e: React.DragEvent) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    /** Keyboard alternative: Alt + arrow up / down. */
    onMove: (direction: -1 | 1) => void;
}

interface TodoItemProps extends TodoItemActions {
    todo: Todo;
    subtasks?: Todo[];
    /** Rename, edit, delete and add subtasks; ticking is open to everyone who sees the todo. */
    canManage: boolean;
    currentUserId?: number | null;
    /** Present when the row can be reordered by hand. */
    drag?: TodoDragProps;
}

const ACTION_BUTTON =
    'sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-8 w-8 text-muted-foreground';

export function TodoItem({ todo, subtasks = [], canManage, currentUserId = null, drag, ...actions }: TodoItemProps) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [renaming, setRenaming] = useState(false);
    const [draftTitle, setDraftTitle] = useState('');
    const [newSubtask, setNewSubtask] = useState('');

    const isSubtask = todo.parentId !== null;
    const done = subtasks.filter((s) => s.isCompleted).length;
    const due = todo.dueDate ? describeDue(todo.dueDate, new Date(), todo.dueTime) : null;
    const assigneeName = todo.assignee ? todo.assignee.fullname || todo.assignee.username : null;
    const isCollective = todo.scope === 'COLLECTIVE' && !isSubtask;
    const mine = todo.assigneeId !== null && todo.assigneeId === currentUserId;
    const activity = (todo._count?.comments ?? 0) + (todo._count?.attachments ?? 0);
    const priorityText = t('todos.priorityAria', { priority: t(`todos.priorities.${todo.priority}`).toLowerCase() });
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
        <div
            data-todo-row
            className={`${isSubtask ? '' : 'rounded-lg border bg-card text-card-foreground shadow-sm'} ${
                drag?.dragging ? 'opacity-40' : ''
            } ${drag?.over ? 'ring-2 ring-primary' : ''}`}
            onDragOver={drag?.onDragOver}
            onDrop={drag?.onDrop}
        >
            <div
                className={`group flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/50 ${
                    isSubtask ? 'rounded-md py-2' : 'rounded-lg'
                }`}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {drag && (
                        <button
                            type="button"
                            draggable
                            aria-label={t('todos.item.dragHandle', { title: todo.title })}
                            title={t('todos.item.dragHint')}
                            className="-ml-1 hidden shrink-0 cursor-grab touch-none text-muted-foreground/60 hover:text-foreground focus-visible:text-foreground sm:block"
                            onDragStart={drag.onDragStart}
                            onDragEnd={drag.onDragEnd}
                            onKeyDown={(e) => {
                                if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                                    e.preventDefault();
                                    drag.onMove(e.key === 'ArrowUp' ? -1 : 1);
                                }
                            }}
                        >
                            <GripVertical className="h-4 w-4" />
                        </button>
                    )}
                    <Checkbox
                        checked={todo.isCompleted}
                        aria-label={t('todos.item.complete', { title: todo.title })}
                        onCheckedChange={(checked) => actions.onToggle(todo, checked === true)}
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                        {renaming ? (
                            <Input
                                autoFocus
                                value={draftTitle}
                                maxLength={255}
                                aria-label={t('todos.item.titleLabel')}
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
                                title={canManage ? t('todos.item.renameHint') : undefined}
                                onDoubleClick={startRename}
                            >
                                {PRIORITY_DOT[todo.priority] && (
                                    <span
                                        role="img"
                                        aria-label={priorityText}
                                        title={priorityText}
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

                        {(due || assigneeName || todo.recurrence !== 'NONE' || subtasks.length > 0 || (todo.isCompleted && completer)) && (
                            <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {due && (
                                    <Badge
                                        variant={due.overdue && !todo.isCompleted ? 'destructive' : 'secondary'}
                                        className="text-[10px] px-1.5 py-0 h-4"
                                    >
                                        {due.label}
                                    </Badge>
                                )}
                                {assigneeName && (
                                    <Badge
                                        variant={mine ? 'default' : 'outline'}
                                        className="gap-1 text-[10px] px-1.5 py-0 h-4"
                                    >
                                        <User className="h-2.5 w-2.5" aria-hidden="true" />
                                        {mine ? t('todos.item.assignedToYou') : assigneeName}
                                    </Badge>
                                )}
                                {todo.recurrence !== 'NONE' && (
                                    <Repeat className="h-3 w-3 text-muted-foreground" aria-label={t('todos.item.recurring')} />
                                )}
                                {subtasks.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                        {done}/{subtasks.length}
                                    </Badge>
                                )}
                                {todo.isCompleted && completer && (
                                    <span className="text-[10px] text-muted-foreground">{t('todos.item.completedBy', { name: completer })}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center shrink-0">
                    {isCollective && !todo.isCompleted && !todo.assigneeId && actions.onTake && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mr-1 h-7 gap-1 px-2 text-xs"
                            onClick={() => actions.onTake?.(todo)}
                        >
                            <HandHelping className="h-3.5 w-3.5" />
                            {t('todos.item.take')}
                        </Button>
                    )}
                    {isCollective && !todo.isCompleted && todo.assigneeId && (mine || canManage) && actions.onRelease && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t('todos.item.release')}
                            title={t('todos.item.release')}
                            className={`${ACTION_BUTTON} hover:text-primary`}
                            onClick={() => actions.onRelease?.(todo)}
                        >
                            <UserMinus className="h-4 w-4" />
                        </Button>
                    )}
                    {!isSubtask && actions.onOpenDetails && (
                        <Button
                            variant="ghost"
                            size="sm"
                            aria-label={t('todos.item.details')}
                            title={t('todos.item.details')}
                            className={`h-8 gap-1 px-2 text-muted-foreground ${activity > 0 ? '' : 'sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity'}`}
                            onClick={() => actions.onOpenDetails?.(todo)}
                        >
                            <MessageSquare className="h-4 w-4" />
                            {activity > 0 && <span className="text-xs">{activity}</span>}
                        </Button>
                    )}
                    {!isSubtask && (subtasks.length > 0 || canManage) && (
                        <Button
                            variant="ghost"
                            size="icon"
                            aria-label={expanded ? t('todos.item.hideSubtasks') : t('todos.item.showSubtasks')}
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
                                aria-label={t('todos.item.edit')}
                                className={`${ACTION_BUTTON} hover:text-primary`}
                                onClick={() => actions.onEdit(todo)}
                            >
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('todos.item.delete')}
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
                        <TodoItem key={subtask.id} todo={subtask} canManage={canManage} currentUserId={currentUserId} {...actions} />
                    ))}
                    {canManage && (
                        <form onSubmit={submitSubtask} className="flex gap-2 pt-1">
                            <Input
                                value={newSubtask}
                                maxLength={255}
                                placeholder={t('todos.item.newSubtaskPlaceholder')}
                                aria-label={t('todos.item.newSubtask')}
                                className="h-8"
                                onChange={(e) => setNewSubtask(e.target.value)}
                            />
                            <Button type="submit" size="sm" variant="secondary" disabled={!newSubtask.trim()}>
                                {t('todos.add')}
                            </Button>
                        </form>
                    )}
                </div>
            )}
        </div>
    );
}
