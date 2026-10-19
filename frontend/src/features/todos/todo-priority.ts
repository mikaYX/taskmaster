import type { TodoPriority, TodoRecurrence } from '@/api/todos';

export const PRIORITY_OPTIONS: { value: TodoPriority; label: string }[] = [
    { value: 'LOW', label: 'Basse' },
    { value: 'NORMAL', label: 'Normale' },
    { value: 'HIGH', label: 'Haute' },
    { value: 'URGENT', label: 'Urgente' },
];

export const priorityLabel = (priority: TodoPriority) =>
    PRIORITY_OPTIONS.find((o) => o.value === priority)?.label ?? priority;

/** Dot color per priority; NORMAL shows nothing to keep the list quiet. */
export const PRIORITY_DOT: Record<TodoPriority, string | null> = {
    LOW: 'bg-sky-400',
    NORMAL: null,
    HIGH: 'bg-orange-500',
    URGENT: 'bg-red-600',
};

export const RECURRENCE_OPTIONS: { value: TodoRecurrence; label: string }[] = [
    { value: 'NONE', label: 'Aucune' },
    { value: 'DAILY', label: 'Chaque jour' },
    { value: 'WEEKLY', label: 'Chaque semaine' },
    { value: 'MONTHLY', label: 'Chaque mois' },
];
