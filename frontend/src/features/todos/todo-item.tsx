import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    CalendarDays,
    ChevronRight,
    GripVertical,
    HandHelping,
    Send,
    ListPlus,
    MessageSquare,
    Pencil,
    Trash2,
    User,
    UserMinus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
    /** A team lead hands the todo out (to a member, or back to the team). */
    onDispatch?: (todo: Todo) => void;
    canDispatch?: (todo: Todo) => boolean;
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

/** Small rounded chip used for the due date, assignee and subtask progress. */
const CHIP = 'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11px] font-medium';

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
    const overdue = !!due?.overdue && !todo.isCompleted;
    const scopeLabel = t(todo.scope === 'COLLECTIVE' ? 'todos.item.scopeCollective' : 'todos.item.scopePrivate');

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
            className={cn(
                !isSubtask &&
                    'relative overflow-hidden rounded-2xl border border-border/60 bg-card text-card-foreground shadow-xs transition-all duration-200 hover:-translate-y-px hover:border-primary/30 hover:shadow-md',
                !isSubtask && todo.isCompleted && 'bg-muted/20 opacity-75 shadow-none hover:translate-y-0',
                !isSubtask && overdue && 'border-red-500/30',
                drag?.dragging && 'opacity-40',
                drag?.over && 'ring-2 ring-primary',
            )}
            onDragOver={drag?.onDragOver}
            onDrop={drag?.onDrop}
        >
            {!isSubtask && PRIORITY_DOT[todo.priority] && !todo.isCompleted && (
                <span
                    role="img"
                    aria-label={priorityText}
                    title={priorityText}
                    className={cn('absolute inset-y-2.5 left-0 w-1 rounded-r-full', PRIORITY_DOT[todo.priority])}
                />
            )}
            <div
                className={cn(
                    'group flex items-center justify-between gap-3 transition-colors',
                    isSubtask ? 'rounded-lg px-2 py-1.5 hover:bg-accent/50' : 'px-4 py-3.5',
                )}
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
                    {!isSubtask && (
                        <span
                            role="img"
                            aria-label={scopeLabel}
                            title={scopeLabel}
                            className={cn(
                                'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold',
                                todo.scope === 'COLLECTIVE'
                                    ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
                                    : 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
                            )}
                        >
                            {todo.scope === 'COLLECTIVE' ? 'C' : 'P'}
                        </span>
                    )}
                    <Checkbox
                        className={cn(
                            'rounded-full transition-colors hover:border-primary data-[state=checked]:border-emerald-500 data-[state=checked]:bg-emerald-500',
                            isSubtask ? 'h-4 w-4' : 'h-5 w-5',
                        )}
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
                                className={cn(
                                    'block truncate font-medium',
                                    isSubtask ? 'text-sm' : 'text-[15px] leading-snug',
                                    todo.isCompleted && 'text-muted-foreground line-through',
                                )}
                                title={canManage ? t('todos.item.renameHint') : undefined}
                                onDoubleClick={startRename}
                            >
                                {isSubtask && PRIORITY_DOT[todo.priority] && (
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

                        {(due || assigneeName || subtasks.length > 0 || (todo.isCompleted && completer)) && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                {due && (
                                    <span
                                        className={cn(
                                            CHIP,
                                            overdue
                                                ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                                                : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        <CalendarDays className="h-3 w-3" aria-hidden="true" />
                                        {due.label}
                                    </span>
                                )}
                                {assigneeName && (
                                    <span
                                        className={cn(
                                            CHIP,
                                            mine ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
                                        )}
                                    >
                                        <User className="h-3 w-3" aria-hidden="true" />
                                        {mine ? t('todos.item.assignedToYou') : assigneeName}
                                    </span>
                                )}
                                {subtasks.length > 0 && (
                                    <span className={cn(CHIP, 'bg-muted text-muted-foreground tabular-nums')}>
                                        <span className="h-1 w-8 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                                            <span
                                                className="block h-full rounded-full bg-emerald-500 transition-all"
                                                style={{ width: `${(done / subtasks.length) * 100}%` }}
                                            />
                                        </span>
                                        {done}/{subtasks.length}
                                    </span>
                                )}
                                {todo.isCompleted && completer && (
                                    <span className="text-[11px] text-muted-foreground">{t('todos.item.completedBy', { name: completer })}</span>
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
                    {isCollective && !todo.isCompleted && !canManage && actions.onDispatch && actions.canDispatch?.(todo) && (
                        <Button
                            variant="outline"
                            size="sm"
                            className="mr-1 h-7 gap-1 px-2 text-xs"
                            onClick={() => actions.onDispatch?.(todo)}
                        >
                            <Send className="h-3.5 w-3.5" />
                            {t('todos.dispatch.button')}
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
                <div className="ml-12 mr-3 mb-3 space-y-0.5 rounded-xl border-l-2 border-primary/20 bg-muted/30 px-2 py-2">
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
