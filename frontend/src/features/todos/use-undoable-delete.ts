import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { Todo } from '@/api/todos';
import { useDeleteTodo } from '@/hooks/use-todos';

const UNDO_DELAY_MS = 5000;

/**
 * Deleting a todo hides it for five seconds with an "Undo" button; the real DELETE only
 * goes out afterwards. Shared by the todo page and the floating button.
 */
export function useUndoableDelete() {
    const { t } = useTranslation();
    const deleteTodo = useDeleteTodo();
    const [pendingIds, setPendingIds] = useState<number[]>([]);

    const requestDelete = (todo: Todo) => {
        let undone = false;
        let committed = false;
        const unhide = () => setPendingIds((ids) => ids.filter((id) => id !== todo.id));
        const commit = () => {
            if (undone || committed) return;
            committed = true;
            deleteTodo.mutate(todo.id, { onSettled: unhide });
        };

        setPendingIds((ids) => [...ids, todo.id]);
        toast(t('todos.toasts.deleted'), {
            description: todo.title,
            duration: UNDO_DELAY_MS,
            action: {
                label: t('todos.toasts.undo'),
                onClick: () => {
                    undone = true;
                    unhide();
                },
            },
            onAutoClose: commit,
            onDismiss: commit,
        });
    };

    return { pendingIds, requestDelete };
}
