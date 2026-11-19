/** Where a todo is opened: the todos page with the todo (and comment) to show. */
export function todoLink(todoId?: number, commentId?: number): string {
    if (!todoId) return '/todos';
    const params = new URLSearchParams({ todoId: String(todoId) });
    if (commentId) params.set('commentId', String(commentId));
    return `/todos?${params.toString()}`;
}
