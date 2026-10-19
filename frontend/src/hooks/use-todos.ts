import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { todosApi, type CreateTodoDto, type Todo, type UpdateTodoDto } from '../api/todos';

export function useTodos(scope?: 'PRIVATE' | 'COLLECTIVE') {
    return useQuery({
        queryKey: ['todos', scope],
        queryFn: () => todosApi.getAll(scope),
    });
}

export function useCreateTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (dto: CreateTodoDto) => todosApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
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
            await queryClient.cancelQueries({ queryKey: ['todos'] });
            const previous = queryClient.getQueriesData<Todo[]>({ queryKey: ['todos'] });
            queryClient.setQueriesData<Todo[]>({ queryKey: ['todos'] }, (todos) =>
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
            queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
    });
}

export function useClearCompletedTodos() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (scope: 'PRIVATE' | 'COLLECTIVE') => todosApi.clearCompleted(scope),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
    });
}

export function useDeleteTodo() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => todosApi.remove(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['todos'] });
        },
    });
}
