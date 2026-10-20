import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertTriangle, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { tasksApi } from '@/api/tasks';

interface DeleteTaskDialogProps {
    task: { id: number; name: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function DeleteTaskDialog({ task, open, onOpenChange, onSuccess }: DeleteTaskDialogProps) {
    const { t } = useTranslation();
    const [confirmName, setConfirmName] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isConfirmed = confirmName.trim().toLowerCase() === task.name.trim().toLowerCase();

    const handleDelete = async () => {
        if (!isConfirmed) return;

        setIsDeleting(true);
        try {
            await tasksApi.deleteTask(task.id);
            toast.success(t('taskDelete.deleted'), {
                description: t('taskDelete.restoreHint'),
            });
            onOpenChange(false);
            onSuccess?.();
        } catch (error: unknown) {
            console.error('Failed to delete task:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error(t('taskDelete.failed'), {
                description: err.response?.data?.message || t('errors.generic'),
            });
        } finally {
            setIsDeleting(false);
            setConfirmName('');
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="items-center text-center sm:items-center sm:text-center">
                    <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 ring-8 ring-destructive/5">
                        <Trash2 className="h-6 w-6 text-destructive" />
                    </div>
                    <DialogTitle className="text-lg">
                        {t('taskDelete.title')}
                    </DialogTitle>
                    <DialogDescription>
                        <Trans
                            i18nKey="taskDelete.description"
                            values={{ name: task.name }}
                            components={{ strong: <strong /> }}
                        />
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
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
                        <label htmlFor="delete-task-confirm" className="text-sm font-medium">
                            <Trans
                                i18nKey="taskDelete.confirmPrompt"
                                values={{ name: task.name }}
                                components={{ name: <span className="font-mono text-destructive" /> }}
                            />
                        </label>
                        <Input
                            id="delete-task-confirm"
                            autoComplete="off"
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            placeholder={t('taskDelete.placeholder')}
                            className="font-mono"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="outline" className="sm:flex-1" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        className="sm:flex-1"
                        onClick={handleDelete}
                        disabled={!isConfirmed || isDeleting}
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                {t('taskDelete.deleting')}
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('taskDelete.title')}
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
