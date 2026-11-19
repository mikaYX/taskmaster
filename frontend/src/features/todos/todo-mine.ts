import type { Todo } from '@/api/todos';

/** Mine = my private todo, or a todo assigned to me personally (not a team's, not someone else's). */
export const isMyTodo = (todo: Todo, userId: number | null) =>
    todo.scope === 'PRIVATE' ? todo.userId === userId : todo.assigneeId !== null && todo.assigneeId === userId;
