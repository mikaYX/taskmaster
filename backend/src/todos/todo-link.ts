/**
 * Where a todo notification leads. With an id the page opens that todo (and scrolls to the
 * comment); without one it is just the list, as the older notifications still are.
 */
export function todoLink(todoId?: number, commentId?: number): string {
  if (!todoId) return '/todos';
  const params = new URLSearchParams({ todoId: String(todoId) });
  if (commentId) params.set('commentId', String(commentId));
  return `/todos?${params.toString()}`;
}
