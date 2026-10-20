import type { TodoPriority } from '@/api/todos';

/** Labels live in the locale files: `todos.priorities.<value>`. */
export const PRIORITY_VALUES: TodoPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

/** Dot color per priority; NORMAL shows nothing to keep the list quiet. */
export const PRIORITY_DOT: Record<TodoPriority, string | null> = {
    LOW: 'bg-sky-400',
    NORMAL: null,
    HIGH: 'bg-orange-500',
    URGENT: 'bg-red-600',
};
