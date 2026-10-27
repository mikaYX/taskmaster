import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { tasksApi } from '@/api/tasks';
import type { Task } from '@/api/types';
import { runBulkTaskAction } from './run-bulk-task-action';

interface BulkDeactivateDialogProps {
    tasks: Pick<Task, 'id' | 'name'>[];
    open: boolean;
    /** `done` is true once something was deactivated, so the page can refresh and drop its selection. */
    onClose: (done: boolean) => void;
}

/** Same confirmation as the per-task "deactivate", for the whole selection. */
export function BulkDeactivateDialog({ tasks, open, onClose }: BulkDeactivateDialogProps) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(false);

    const confirm = async () => {
        setPending(true);
        const { done, failed } = await runBulkTaskAction(tasks, tasksApi.deactivate);
        setPending(false);
        if (failed.length === 0) toast.success(t('taskList.bulk.deactivated', { count: done }));
        else toast.error(t('taskList.bulk.deactivateFailed', { count: failed.length }), { description: failed.map(item => item.name).join(', ') });
        onClose(done > 0);
    };

    return (
        <AlertDialog open={open} onOpenChange={(next) => { if (!next && !pending) onClose(false); }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{t('taskList.bulk.deactivateTitle', { count: tasks.length })}</AlertDialogTitle>
                    <AlertDialogDescription>{t('taskList.bulk.deactivateBody', { count: tasks.length })}</AlertDialogDescription>
                </AlertDialogHeader>
                <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm">
                    {tasks.map(task => <li key={task.id}>{task.name}</li>)}
                </ul>
                <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction
                        disabled={pending}
                        onClick={(event) => { event.preventDefault(); void confirm(); }}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('taskList.actions.deactivate')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
