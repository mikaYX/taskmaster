import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { todosApi, type CreateTodoDto, type UpdateTodoDto } from '../api/todos';

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
