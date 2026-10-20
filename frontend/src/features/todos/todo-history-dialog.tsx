import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { TodoScope } from '@/api/todos';
import { useTodoHistory } from '@/hooks/use-todos';
import { getDateLocale } from '@/lib/date-locale';

interface TodoHistoryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    scope: TodoScope;
}

/** Every ticked todo of the current tab, beyond the 24 hours of the main list. */
export function TodoHistoryDialog({ open, onOpenChange, scope }: TodoHistoryDialogProps) {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const history = useTodoHistory(scope, search.trim(), open);
    const items = history.data?.pages.flatMap((page) => page.items) ?? [];
    const dateLocale = getDateLocale().code;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('todos.history.title')}</DialogTitle>
                    <DialogDescription>
                        {scope === 'COLLECTIVE' ? t('todos.history.descriptionCollective') : t('todos.history.descriptionPrivate')}
                    </DialogDescription>
                </DialogHeader>

                <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        type="search"
                        value={search}
                        aria-label={t('todos.searchLabel')}
                        placeholder={t('todos.search')}
                        className="pl-9"
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div className="max-h-[50vh] overflow-y-auto">
                    {history.isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                    ) : items.length === 0 ? (
                        <p className="py-8 text-center text-sm text-muted-foreground">{t('todos.history.empty')}</p>
                    ) : (
                        <ul className="divide-y">
                            {items.map((todo) => (
                                <li key={todo.id} className="flex items-start justify-between gap-3 py-2.5">
                                    <span className="min-w-0 text-sm">
                                        <span className="block truncate">{todo.title}</span>
                                        {todo.completedBy && (
                                            <span className="block text-xs text-muted-foreground">
                                                {t('todos.item.completedBy', {
                                                    name: todo.completedBy.fullname || todo.completedBy.username,
                                                })}
                                            </span>
                                        )}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground">
                                        {todo.completedAt &&
                                            new Date(todo.completedAt).toLocaleString(dateLocale, {
                                                dateStyle: 'medium',
                                                timeStyle: 'short',
                                            })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {history.hasNextPage && (
                    <Button variant="outline" disabled={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>
                        {history.isFetchingNextPage && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('todos.history.loadMore')}
                    </Button>
                )}
            </DialogContent>
        </Dialog>
    );
}
