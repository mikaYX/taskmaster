import type { Todo, TodoPriority, TodoRecurrence, UpdateTodoDto } from '@/api/todos';
import { remindToSelect, selectToRemind } from './todo-schedule';

export interface TodoEditForm {
    title: string;
    dueDate: string;
    priority: TodoPriority;
    recurrence: TodoRecurrence;
    description: string;
    /** HH:mm, '' = no time of day. */
    dueTime: string;
    /** 'default' or minutes before the due moment, as a string. */
    remind: string;
    /** '' = nobody. */
    assigneeId: string;
    /** '' means the whole site (no group). */
    groupId: string;
}

/** `<input type="date">` wants YYYY-MM-DD; the API stores an ISO timestamp. */
export const toDateInput = (value: string | null) => (value ? value.slice(0, 10) : '');

export const formFromTodo = (todo: Todo): TodoEditForm => ({
    title: todo.title,
    dueDate: toDateInput(todo.dueDate),
    priority: todo.priority,
    recurrence: todo.recurrence,
    description: todo.description ?? '',
    dueTime: todo.dueTime ?? '',
    remind: remindToSelect(todo.remindBeforeMinutes),
    assigneeId: todo.assigneeId?.toString() ?? '',
    groupId: todo.groupId?.toString() ?? '',
});

/**
 * Builds the PATCH body from the form, keeping only what changed so a rename
 * does not touch the due date and vice versa. An emptied date clears it (null),
 * and so does going back to "whole site" for the group.
 */
export function buildTodoUpdate(todo: Todo, form: TodoEditForm): UpdateTodoDto {
    const dto: UpdateTodoDto = {};
    const title = form.title.trim();
    if (title !== todo.title) dto.title = title;
    if (form.dueDate !== toDateInput(todo.dueDate)) dto.dueDate = form.dueDate || null;
    if (form.priority !== todo.priority) dto.priority = form.priority;
    if (form.recurrence !== todo.recurrence) dto.recurrence = form.recurrence;
    const description = form.description.trim();
    if (description !== (todo.description ?? '')) dto.description = description || null;
    if (form.dueTime !== (todo.dueTime ?? '')) dto.dueTime = form.dueTime || null;
    if (form.remind !== remindToSelect(todo.remindBeforeMinutes)) dto.remindBeforeMinutes = selectToRemind(form.remind);
    if (form.assigneeId !== (todo.assigneeId?.toString() ?? '')) {
        dto.assigneeId = form.assigneeId === '' ? null : Number(form.assigneeId);
    }
    if (form.groupId !== (todo.groupId?.toString() ?? '')) {
        dto.groupId = form.groupId === '' ? null : Number(form.groupId);
    }
    return dto;
}
