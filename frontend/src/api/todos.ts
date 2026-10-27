import { http } from './http';
import type {
    Todo,
    TodoAttachment,
    TodoComment,
    TodoHistoryPage,
    TodoPreferences,
    TodoPriority,
    TodoScope,
    TodoSummary,
    CreateTodoDto,
    UpdateTodoDto,
    InboxList,
} from './types';

export type {
    Todo,
    TodoAttachment,
    TodoComment,
    TodoHistoryPage,
    TodoPreferences,
    TodoPriority,
    TodoScope,
    TodoSummary,
    CreateTodoDto,
    UpdateTodoDto,
};

/** A team the current user leads, with the people a todo can be handed out to. */
export interface DispatchTeam {
    id: number;
    name: string;
    memberCount: number;
    members: { id: number; username: string; fullname: string | null }[];
}

export const todosApi = {
    dispatchTargets: async () => await http.get<DispatchTeam[]>('/todos/dispatch-targets'),

    getAll: async (scope?: 'PRIVATE' | 'COLLECTIVE') => {
        const params = scope ? { scope } : undefined;
        return await http.get<Todo[]>('/todos', { params });
    },

    summary: async () => await http.get<TodoSummary>('/todos/summary'),

    history: async (options: { scope?: TodoScope; search?: string; cursor?: number | null } = {}) => {
        const params = new URLSearchParams();
        if (options.scope) params.set('scope', options.scope);
        if (options.search?.trim()) params.set('search', options.search.trim());
        if (options.cursor) params.set('cursor', String(options.cursor));
        const query = params.toString();
        return await http.get<TodoHistoryPage>(`/todos/history${query ? `?${query}` : ''}`);
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

    /** Orders one priority group: ids from top to bottom. */
    reorder: async (ids: number[]) => await http.patch<{ success: boolean }>('/todos/reorder', { ids }),

    getPreferences: async () => await http.get<TodoPreferences>('/todos/preferences'),

    updatePreferences: async (dto: Partial<Pick<TodoPreferences, 'email' | 'push' | 'collective'>>) =>
        await http.put<TodoPreferences>('/todos/preferences', dto),

    comments: async (id: number) => await http.get<TodoComment[]>(`/todos/${id}/comments`),

    addComment: async (id: number, body: string) => await http.post<TodoComment>(`/todos/${id}/comments`, { body }),

    deleteComment: async (id: number, commentId: number) =>
        await http.delete<{ success: boolean }>(`/todos/${id}/comments/${commentId}`),

    attachments: async (id: number) => await http.get<TodoAttachment[]>(`/todos/${id}/attachments`),

    addAttachment: async (id: number, file: File) => {
        const data = new FormData();
        data.append('file', file);
        return await http.post<TodoAttachment>(`/todos/${id}/attachments`, data);
    },

    downloadAttachment: async (id: number, attachmentId: string) =>
        await http.get<Blob>(`/todos/${id}/attachments/${attachmentId}`, { responseType: 'blob' }),

    deleteAttachment: async (id: number, attachmentId: string) =>
        await http.delete<{ success: boolean }>(`/todos/${id}/attachments/${attachmentId}`),
};

/** The signed-in person's notification center (the bell). */
export const inboxApi = {
    list: async () => await http.get<InboxList>('/inbox'),
    markRead: async (id: number) => await http.post<{ success: boolean }>(`/inbox/${id}/read`),
    markAllRead: async () => await http.post<{ updated: number }>('/inbox/read-all'),
};
