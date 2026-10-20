import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { todosApi, inboxApi, type CreateTodoDto, type Todo, type TodoScope, type UpdateTodoDto } from '../api/todos';

/** Lists refresh by themselves, so a colleague ticking a collective todo shows up. */
const LIST_REFRESH_MS = 30_000;
/** The counters of the badges and the bell are cheap: a slower tick is enough. */
const COUNTER_REFRESH_MS = 60_000;

/**
 * Query keys. Everything lives under `['todos']` so a mutation can refresh the lists,
 * the counters and the history in one call; lists have their own sub-key so an
 * optimistic update never touches comments or counters.
 */
export const todoKeys = {
    all: ['todos'] as const,
    lists: ['todos', 'list'] as const,
    list: (scope?: TodoScope) => ['todos', 'list', scope] as const,
    summary: ['todos', 'summary'] as const,
    history: (scope: TodoScope | undefined, search: string) => ['todos', 'history', scope, search] as const,
    preferences: ['todos', 'preferences'] as const,
    comments: (id: number) => ['todos', 'detail', id, 'comments'] as const,
    attachments: (id: number) => ['todos', 'detail', id, 'attachments'] as const,
};

export function useTodos(scope?: TodoScope) {
    return useQuery({
        queryKey: todoKeys.list(scope),
        queryFn: () => todosApi.getAll(scope),
        refetchInterval: LIST_REFRESH_MS,
        // No point polling a tab nobody looks at; it refreshes on focus instead.
        refetchIntervalInBackground: false,
    });
}

/** What needs attention now: drives the badges and the reminder shown on opening. */
export function useTodoSummary(enabled = true) {
    return useQuery({
        queryKey: todoKeys.summary,
        queryFn: () => todosApi.summary(),
        enabled,
        refetchInterval: COUNTER_REFRESH_MS,
        refetchIntervalInBackground: false,
    });
}

/** Every ticked todo, newest first, 30 at a time. */
export function useTodoHistory(scope: TodoScope | undefined, search: string, enabled: boolean) {
    return useInfiniteQuery({
        queryKey: todoKeys.history(scope, search),
        queryFn: ({ pageParam }) => todosApi.history({ scope, search, cursor: pageParam }),
        initialPageParam: null as number | null,
        getNextPageParam: (last) => last.nextCursor ?? undefined,
        enabled,
    });
}

export function useCreateTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateTodoDto) => todosApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useUpdateTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: UpdateTodoDto }) =>
            todosApi.update(id, dto),
        // Optimistic: the checkbox flips immediately, rolled back if the server refuses.
        onMutate: async ({ id, dto }) => {
            await queryClient.cancelQueries({ queryKey: todoKeys.lists });
            const previous = queryClient.getQueriesData<Todo[]>({ queryKey: todoKeys.lists });
            queryClient.setQueriesData<Todo[]>({ queryKey: todoKeys.lists }, (todos) =>
                todos?.map((t) =>
                    t.id === id
                        ? {
                              ...t,
                              ...(dto.title !== undefined && { title: dto.title }),
                              ...(dto.priority !== undefined && { priority: dto.priority }),
                              ...(dto.isCompleted !== undefined && { isCompleted: dto.isCompleted }),
                          }
                        : t,
                ),
            );
            return { previous };
        },
        onError: (_err, _vars, context) => {
            context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

/** Saves the manual order of one priority group (ids top to bottom). */
export function useReorderTodos() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: number[]) => todosApi.reorder(ids),
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: todoKeys.lists });
            const previous = queryClient.getQueriesData<Todo[]>({ queryKey: todoKeys.lists });
            queryClient.setQueriesData<Todo[]>({ queryKey: todoKeys.lists }, (todos) =>
                todos?.map((t) => (ids.includes(t.id) ? { ...t, position: ids.indexOf(t.id) + 1 } : t)),
            );
            return { previous };
        },
        onError: (_err, _vars, context) => {
            context?.previous.forEach(([key, data]) => queryClient.setQueryData(key, data));
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useClearCompletedTodos() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (scope: TodoScope) => todosApi.clearCompleted(scope),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useDeleteTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => todosApi.remove(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useTodoPreferences(enabled = true) {
    return useQuery({
        queryKey: todoKeys.preferences,
        queryFn: () => todosApi.getPreferences(),
        enabled,
    });
}

export function useUpdateTodoPreferences() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: Parameters<typeof todosApi.updatePreferences>[0]) => todosApi.updatePreferences(dto),
        onSuccess: (data) => {
            queryClient.setQueryData(todoKeys.preferences, data);
        },
    });
}

export function useTodoComments(id: number | null) {
    return useQuery({
        queryKey: todoKeys.comments(id ?? 0),
        queryFn: () => todosApi.comments(id!),
        enabled: id !== null,
    });
}

export function useAddTodoComment(id: number) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: string) => todosApi.addComment(id, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useDeleteTodoComment(id: number) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (commentId: number) => todosApi.deleteComment(id, commentId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useTodoAttachments(id: number | null) {
    return useQuery({
        queryKey: todoKeys.attachments(id ?? 0),
        queryFn: () => todosApi.attachments(id!),
        enabled: id !== null,
    });
}

export function useAddTodoAttachment(id: number) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (file: File) => todosApi.addAttachment(id, file),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

export function useDeleteTodoAttachment(id: number) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (attachmentId: string) => todosApi.deleteAttachment(id, attachmentId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: todoKeys.all });
        },
    });
}

/** The bell: the latest notifications and how many are unread. */
export function useInbox(enabled = true) {
    return useQuery({
        queryKey: ['inbox'],
        queryFn: () => inboxApi.list(),
        enabled,
        refetchInterval: COUNTER_REFRESH_MS,
        refetchIntervalInBackground: false,
    });
}

export function useMarkInboxRead() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (id: number | 'all') => {
            if (id === 'all') await inboxApi.markAllRead();
            else await inboxApi.markRead(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inbox'] });
        },
    });
}
