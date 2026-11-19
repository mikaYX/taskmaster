import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';
import { CornerDownRight, FileText, Image as ImageIcon, Loader2, Paperclip, Reply, Send, Trash2, Upload, X } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import type { Todo, TodoAttachment, TodoComment } from '@/api/todos';
import { todosApi } from '@/api/todos';
import { getErrorMessage } from '@/api/http';
import {
    useAddTodoAttachment,
    useAddTodoComment,
    useDeleteTodoAttachment,
    useDeleteTodoComment,
    useMarkCommentsRead,
    useTodoAttachments,
    useTodoComments,
} from '@/hooks/use-todos';
import { getDateLocale } from '@/lib/date-locale';
import { cn } from '@/lib/utils';
import { MentionTextarea, type PickedMention } from './mention-textarea';
import { mentionsStillInText, splitMentions } from './todo-mentions';

interface TodoDetailsSheetProps {
    todo: Todo | null;
    /** The signed-in person: authors may delete their own comments and files. */
    currentUserId: number | null;
    /** Managers may delete anything. */
    isManager: boolean;
    onClose: () => void;
    /** A comment to scroll to and highlight (from a notification link). */
    focusCommentId?: number | null;
}

const personName = (p: { fullname: string | null; username: string }) => p.fullname || p.username;

const formatSize = (bytes: number) =>
    bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

/** Comments and attachments of one todo, in a side panel. */
export function TodoDetailsSheet({ todo, currentUserId, isManager, onClose, focusCommentId = null }: TodoDetailsSheetProps) {
    return (
        <Sheet open={todo !== null} onOpenChange={(open) => !open && onClose()}>
            <SheetContent className="w-full sm:max-w-md flex flex-col gap-0 p-0">
                {/* keyed by todo: drafts never leak from one todo to another */}
                {todo && (
                    <DetailsBody
                        key={todo.id}
                        todo={todo}
                        currentUserId={currentUserId}
                        isManager={isManager}
                        focusCommentId={focusCommentId}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
}

function DetailsBody({
    todo,
    currentUserId,
    isManager,
    focusCommentId,
}: {
    todo: Todo;
    currentUserId: number | null;
    isManager: boolean;
    focusCommentId: number | null;
}) {
    const { t } = useTranslation();
    const dateLocale = getDateLocale();
    const [draft, setDraft] = useState('');
    const [picked, setPicked] = useState<PickedMention[]>([]);
    // One level of answers: replying to a reply stays in the thread of its root.
    const [replyTo, setReplyTo] = useState<TodoComment | null>(null);
    const [replyDraft, setReplyDraft] = useState('');
    const [replyPicked, setReplyPicked] = useState<PickedMention[]>([]);
    // The comment a link pointed at is highlighted for a few seconds.
    const [flashEnded, setFlashEnded] = useState(false);
    const flashId = focusCommentId && !flashEnded ? focusCommentId : null;
    const fileInput = useRef<HTMLInputElement>(null);
    const attempted = useRef(0);

    const comments = useTodoComments(todo.id);
    const attachments = useTodoAttachments(todo.id);
    const addComment = useAddTodoComment(todo.id);
    const deleteComment = useDeleteTodoComment(todo.id);
    const addAttachment = useAddTodoAttachment(todo.id);
    const deleteAttachment = useDeleteTodoAttachment(todo.id);
    const { mutate: markReadMutate } = useMarkCommentsRead(todo.id);

    const threads = useMemo(() => {
        const all = comments.data ?? [];
        const replies = new Map<number, TodoComment[]>();
        for (const comment of all) {
            if (comment.parentId !== null) replies.set(comment.parentId, [...(replies.get(comment.parentId) ?? []), comment]);
        }
        return all.filter((c) => c.parentId === null).map((root) => ({ root, replies: replies.get(root.id) ?? [] }));
    }, [comments.data]);

    // Read = displayed: only once the comments loaded, and only up to the newest one shown.
    // A failed load never marks anything, and the mark stays until the server confirmed it.
    const newestShown = comments.data && comments.data.length > 0 ? Math.max(...comments.data.map((c) => c.id)) : 0;
    const unread = todo.unreadComments ?? 0;
    useEffect(() => {
        if (!comments.isSuccess || unread === 0 || newestShown <= attempted.current) return;
        attempted.current = newestShown;
        // On failure the mark stays unread and the next refresh of the comments tries again.
        markReadMutate(newestShown, {
            onError: () => {
                attempted.current = 0;
            },
        });
    }, [comments.isSuccess, comments.dataUpdatedAt, unread, newestShown, markReadMutate]);

    // Jump to the comment a notification pointed at.
    useEffect(() => {
        if (!focusCommentId || !comments.data?.some((c) => c.id === focusCommentId)) return;
        document.getElementById(`todo-comment-${focusCommentId}`)?.scrollIntoView?.({ block: 'center' });
        const timer = setTimeout(() => setFlashEnded(true), 3000);
        return () => clearTimeout(timer);
    }, [focusCommentId, comments.data]);

    const send = (body: string, mentions: string[], parentId: number | undefined, done: () => void) => {
        addComment.mutate(
            { body, parentId, mentions },
            {
                onSuccess: done,
                onError: (error) => toast.error(getErrorMessage(error, t('todos.details.commentFailed'))),
            },
        );
    };

    const submitComment = (e?: React.FormEvent) => {
        e?.preventDefault();
        const body = draft.trim();
        if (!body) return;
        send(body, mentionsStillInText(body, picked), undefined, () => {
            setDraft('');
            setPicked([]);
        });
    };

    const submitReply = (e?: React.FormEvent) => {
        e?.preventDefault();
        const body = replyDraft.trim();
        if (!body || !replyTo) return;
        send(body, mentionsStillInText(body, replyPicked), replyTo.parentId ?? replyTo.id, () => {
            setReplyTo(null);
            setReplyDraft('');
            setReplyPicked([]);
        });
    };

    const startReply = (comment: TodoComment) => {
        setReplyTo(comment);
        setReplyDraft('');
        setReplyPicked([]);
    };

    const excerpt = (text: string) => (text.length > 80 ? `${text.slice(0, 80)}…` : text);

    const renderComment = (comment: TodoComment, isReply: boolean) => (
        <div
            id={`todo-comment-${comment.id}`}
            className={cn(
                'group rounded-md border p-3 transition-colors',
                isReply ? 'bg-background' : 'bg-muted/20',
                flashId === comment.id && 'border-primary bg-primary/5',
            )}
        >
            <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{personName(comment.user)}</span>
                    {' · '}
                    {ago(comment.createdAt)}
                </p>
                {!comment.deleted && canDelete(comment.userId) && (
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
            {comment.deleted ? (
                <p className="mt-1 text-sm italic text-muted-foreground">{t('todos.details.deletedComment')}</p>
            ) : (
                <>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm">
                        {splitMentions(comment.body, comment.mentions).map((part, index) =>
                            part.mention ? (
                                <span key={index} className="rounded bg-primary/10 px-1 font-medium text-primary">
                                    {part.text}
                                </span>
                            ) : (
                                <Fragment key={index}>{part.text}</Fragment>
                            ),
                        )}
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground"
                        aria-label={t('todos.details.replyTo', { name: personName(comment.user) })}
                        onClick={() => startReply(comment)}
                    >
                        <Reply className="h-3.5 w-3.5" />
                        {t('todos.details.reply')}
                    </Button>
                </>
            )}
        </div>
    );

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
                        <ul className="space-y-4">
                            {threads.map(({ root, replies }) => (
                                <li key={root.id} className="space-y-2" aria-label={t('todos.details.thread')}>
                                    {renderComment(root, false)}
                                    {replies.length > 0 && (
                                        <ul className="ml-4 space-y-2 border-l-2 pl-3">
                                            {replies.map((reply) => (
                                                <li key={reply.id}>{renderComment(reply, true)}</li>
                                            ))}
                                        </ul>
                                    )}
                                    {replyTo && (replyTo.parentId ?? replyTo.id) === root.id && (
                                        <form onSubmit={submitReply} className="ml-4 space-y-2 border-l-2 pl-3">
                                            <p className="flex items-start gap-1.5 rounded bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                                <CornerDownRight className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                                                <span className="min-w-0 break-words">
                                                    {t('todos.details.replyingTo', {
                                                        name: personName(replyTo.user),
                                                        excerpt: replyTo.deleted ? t('todos.details.deletedComment') : excerpt(replyTo.body),
                                                    })}
                                                </span>
                                            </p>
                                            <MentionTextarea
                                                todoId={todo.id}
                                                value={replyDraft}
                                                onChange={setReplyDraft}
                                                picked={replyPicked}
                                                onPick={(m) => setReplyPicked((list) => [...list, m])}
                                                onSubmit={() => submitReply()}
                                                rows={2}
                                                autoFocus
                                                label={t('todos.details.replyField')}
                                                placeholder={t('todos.details.replyPlaceholder')}
                                            />
                                            <div className="flex gap-2">
                                                <Button type="submit" size="sm" disabled={!replyDraft.trim() || addComment.isPending}>
                                                    <Send className="mr-2 h-4 w-4" />
                                                    {t('todos.details.send')}
                                                </Button>
                                                <Button type="button" size="sm" variant="ghost" onClick={() => setReplyTo(null)}>
                                                    <X className="mr-1 h-4 w-4" />
                                                    {t('todos.details.cancelReply')}
                                                </Button>
                                            </div>
                                        </form>
                                    )}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-muted-foreground">{t('todos.details.noComments')}</p>
                    )}

                    <form onSubmit={submitComment} className="space-y-2">
                        <MentionTextarea
                            todoId={todo.id}
                            value={draft}
                            onChange={setDraft}
                            picked={picked}
                            onPick={(m) => setPicked((list) => [...list, m])}
                            onSubmit={() => submitComment()}
                            label={t('todos.details.newComment')}
                            placeholder={t('todos.details.newCommentPlaceholder')}
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
