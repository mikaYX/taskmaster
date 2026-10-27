import { useState } from 'react';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { tasksApi } from '@/api/tasks';
import type { Task } from '@/api/types';
import { runBulkTaskAction } from './run-bulk-task-action';

interface BulkDeleteDialogProps {
    tasks: Pick<Task, 'id' | 'name'>[];
    open: boolean;
    /** `done` is true once something was deleted, so the page can refresh and drop its selection. */
    onClose: (done: boolean) => void;
}

/** Same warning as the per-task delete; the confirmation is the number of tasks, since there is no single name to type. */
export function BulkDeleteDialog({ tasks, open, onClose }: BulkDeleteDialogProps) {
    const { t } = useTranslation();
    const [confirmText, setConfirmText] = useState('');
    const [pending, setPending] = useState(false);
    const confirmed = confirmText.trim() === String(tasks.length);

    const confirm = async () => {
        if (!confirmed) return;
        setPending(true);
        const { done, failed } = await runBulkTaskAction(tasks, tasksApi.deleteTask);
        setPending(false);
        if (failed.length === 0) toast.success(t('taskList.bulk.deleted', { count: done }), { description: t('taskDelete.restoreHint') });
        else toast.error(t('taskList.bulk.deleteFailed', { count: failed.length }), { description: failed.map(item => item.name).join(', ') });
        onClose(done > 0);
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(false); }}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="items-center text-center sm:items-center sm:text-center">
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
                        <Trash2 className="h-6 w-6 text-destructive" />
                    </div>
                    <DialogTitle className="text-lg">{t('taskList.bulk.deleteTitle', { count: tasks.length })}</DialogTitle>
                    <DialogDescription>{t('taskList.bulk.deleteBody', { count: tasks.length })}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <ul className="max-h-28 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                        {tasks.map(task => <li key={task.id}>{task.name}</li>)}
                    </ul>
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-300">
                        <p className="flex items-center gap-2 font-medium">
                            <AlertTriangle className="h-4 w-4" />
                            {t('taskDelete.warning')}
                        </p>
                        <ul className="mt-2 space-y-1.5 pl-6 text-[13px]">
                            <li className="list-disc">{t('taskDelete.hideStatuses')}</li>
                            <li className="list-disc">{t('taskDelete.loseAccess')}</li>
                            <li className="list-disc">{t('taskDelete.cancelDelegations')}</li>
                        </ul>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="bulk-delete-confirm" className="text-sm font-medium">
                            <Trans
                                i18nKey="taskList.bulk.confirmPrompt"
                                values={{ count: tasks.length }}
                                components={{ name: <span className="font-mono text-destructive" /> }}
                            />
                        </label>
                        <Input
                            id="bulk-delete-confirm"
                            autoComplete="off"
                            inputMode="numeric"
                            value={confirmText}
                            onChange={(event) => setConfirmText(event.target.value)}
                            className="font-mono"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" className="sm:flex-1" onClick={() => onClose(false)} disabled={pending}>
                        {t('common.cancel')}
                    </Button>
                    <Button variant="destructive" className="sm:flex-1" onClick={() => void confirm()} disabled={!confirmed || pending}>
                        {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                        {t('taskList.bulk.deleteTitle', { count: tasks.length })}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
