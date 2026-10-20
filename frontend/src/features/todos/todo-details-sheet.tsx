import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { FileText, Image as ImageIcon, Loader2, Paperclip, Send, Trash2, Upload } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { Todo, TodoAttachment } from '@/api/todos';
import { todosApi } from '@/api/todos';
import { getErrorMessage } from '@/api/http';
import {
    useAddTodoAttachment,
    useAddTodoComment,
    useDeleteTodoAttachment,
    useDeleteTodoComment,
    useTodoAttachments,
    useTodoComments,
} from '@/hooks/use-todos';
import { getDateLocale } from '@/lib/date-locale';

interface TodoDetailsSheetProps {
    todo: Todo | null;
    /** The signed-in person: authors may delete their own comments and files. */
    currentUserId: number | null;
    /** Managers may delete anything. */
    isManager: boolean;
    onClose: () => void;
}

const personName = (p: { fullname: string | null; username: string }) => p.fullname || p.username;

const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

/** Comments and attachments of one todo, in a side panel. */
export function TodoDetailsSheet({ todo, currentUserId, isManager, onClose }: TodoDetailsSheetProps) {
    return (
        <Sheet open={todo !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
                {todo && <DetailsBody todo={todo} currentUserId={currentUserId} isManager={isManager} />}
            </SheetContent>
        </Sheet>
    );
}

function DetailsBody({ todo, currentUserId, isManager }: { todo: Todo; currentUserId: number | null; isManager: boolean }) {
    const { t } = useTranslation();
    const dateLocale = getDateLocale();
    const [draft, setDraft] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);

    const comments = useTodoComments(todo.id);
    const attachments = useTodoAttachments(todo.id);
    const addComment = useAddTodoComment(todo.id);
    const deleteComment = useDeleteTodoComment(todo.id);
    const addAttachment = useAddTodoAttachment(todo.id);
    const deleteAttachment = useDeleteTodoAttachment(todo.id);

    const submitComment = (e: React.FormEvent) => {
        e.preventDefault();
        const body = draft.trim();
        if (!body) return;
        addComment.mutate(body, {
            onSuccess: () => setDraft(''),
            onError: (error) => toast.error(getErrorMessage(error, t('todos.details.commentFailed'))),
        });
    };

    const upload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        addAttachment.mutate(file, {
            onError: (error) => toast.error(getErrorMessage(error, t('todos.details.uploadFailed'))),
        });
    };

    const download = async (attachment: TodoAttachment) => {
        try {
            const blob = await todosApi.downloadAttachment(todo.id, attachment.id);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = attachment.filename;
            link.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(getErrorMessage(error, t('todos.details.downloadFailed')));
        }
    };

    const canDelete = (authorId: number) => isManager || authorId === currentUserId;
    const ago = (iso: string) => formatDistanceToNow(new Date(iso), { addSuffix: true, locale: dateLocale });

    return (
        <>
            <SheetHeader className="border-b p-6 text-left">
                <SheetTitle className="pr-6">{todo.title}</SheetTitle>
                <SheetDescription>{t('todos.details.description')}</SheetDescription>
            </SheetHeader>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
                <section aria-labelledby="todo-comments-title" className="space-y-3">
                    <h3 id="todo-comments-title" className="text-sm font-semibold">
                        {t('todos.details.comments')} ({comments.data?.length ?? 0})
                    </h3>
                    {comments.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : comments.data && comments.data.length > 0 ? (
                        <ul className="space-y-3">
                            {comments.data.map((comment) => (
                                <li key={comment.id} className="group rounded-md border bg-muted/20 p-3">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="text-xs text-muted-foreground">
                                            <span className="font-medium text-foreground">{personName(comment.user)}</span>
                                            {' · '}
                                            {ago(comment.createdAt)}
                                        </p>
                                        {canDelete(comment.userId) && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                aria-label={t('todos.details.deleteComment')}
                                                disabled={deleteComment.isPending}
                                                onClick={() => deleteComment.mutate(comment.id)}
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">{comment.body}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('todos.details.noComments')}</p>
                    )}

                    <form onSubmit={submitComment} className="space-y-2">
                        <Textarea
                            value={draft}
                            maxLength={2000}
                            rows={3}
                            aria-label={t('todos.details.newComment')}
                            placeholder={t('todos.details.newCommentPlaceholder')}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submitComment(e);
                            }}
                        />
                        <Button type="submit" size="sm" disabled={!draft.trim() || addComment.isPending}>
                            <Send className="mr-2 h-4 w-4" />
                            {t('todos.details.send')}
                        </Button>
                    </form>
                </section>

                <Separator />

                <section aria-labelledby="todo-files-title" className="space-y-3">
                    <h3 id="todo-files-title" className="text-sm font-semibold">
                        {t('todos.details.attachments')} ({attachments.data?.length ?? 0})
                    </h3>
                    {attachments.isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : attachments.data && attachments.data.length > 0 ? (
                        <ul className="space-y-2">
                            {attachments.data.map((attachment) => (
                                <li
                                    key={attachment.id}
                                    className="flex items-center gap-3 rounded-md border bg-muted/20 p-2 pr-1"
                                >
                                    {attachment.mimeType === 'application/pdf' ? (
                                        <FileText className="h-5 w-5 shrink-0 text-red-500" />
                                    ) : (
                                        <ImageIcon className="h-5 w-5 shrink-0 text-sky-500" />
                                    )}
                                    <button
                                        type="button"
                                        className="min-w-0 flex-1 text-left hover:underline"
                                        onClick={() => void download(attachment)}
                                        title={t('todos.details.download')}
                                    >
                                        <span className="block truncate text-sm font-medium">{attachment.filename}</span>
                                        <span className="block text-[11px] text-muted-foreground">
                                            {formatSize(attachment.size)} · {personName(attachment.uploader)} · {ago(attachment.createdAt)}
                                        </span>
                                    </button>
                                    {canDelete(attachment.uploader.id) && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            aria-label={t('todos.details.deleteAttachment')}
                                            disabled={deleteAttachment.isPending}
                                            onClick={() => deleteAttachment.mutate(attachment.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('todos.details.noAttachments')}</p>
                    )}

                    <input
                        ref={fileInput}
                        type="file"
                        className="hidden"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        aria-label={t('todos.details.chooseFile')}
                        onChange={upload}
                    />
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={addAttachment.isPending}
                        onClick={() => fileInput.current?.click()}
                    >
                        {addAttachment.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Upload className="mr-2 h-4 w-4" />
                        )}
                        {t('todos.details.addFile')}
                    </Button>
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Paperclip className="h-3 w-3" />
                        {t('todos.details.fileHint')}
                    </p>
                </section>
            </div>
        </>
    );
}
