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
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
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

                <div className="space-y-4 py-4">
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                        <p className="font-medium">{t('taskDelete.warning')}</p>
                        <ul className="mt-2 list-disc list-inside space-y-1">
                            <li>{t('taskDelete.hideStatuses')}</li>
                            <li>{t('taskDelete.loseAccess')}</li>
                            <li>{t('taskDelete.cancelDelegations')}</li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            <Trans
                                i18nKey="taskDelete.confirmPrompt"
                                values={{ name: task.name }}
                                components={{ name: <span className="font-mono text-destructive" /> }}
                            />
                        </label>
                        <Input
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            placeholder={t('taskDelete.placeholder')}
                            className="font-mono"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
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
