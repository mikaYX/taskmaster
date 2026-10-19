import { http } from './http';
import type { Todo, TodoPriority, TodoRecurrence, TodoScope, CreateTodoDto, UpdateTodoDto } from './types';

export type { Todo, TodoPriority, TodoRecurrence, CreateTodoDto, UpdateTodoDto };

export const todosApi = {
    getAll: async (scope?: 'PRIVATE' | 'COLLECTIVE') => {
        const params = scope ? { scope } : undefined;
        return await http.get<Todo[]>('/todos', { params });
    },

    create: async (dto: CreateTodoDto) => {
        return await http.post<Todo>('/todos', dto);
    },

    update: async (id: number, dto: UpdateTodoDto) => {
        return await http.patch<Todo>(`/todos/${id}`, dto);
    },

    remove: async (id: number) => {
        return await http.delete<Todo>(`/todos/${id}`);
    },

    clearCompleted: async (scope: TodoScope) => {
        return await http.delete<{ count: number }>(`/todos/completed?scope=${scope}`);
    },
};
