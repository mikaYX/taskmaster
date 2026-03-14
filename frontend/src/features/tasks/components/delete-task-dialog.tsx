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
import { tasksApi } from '@/api/tasks';

interface DeleteTaskDialogProps {
    task: { id: number; name: string };
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess?: () => void;
}

export function DeleteTaskDialog({ task, open, onOpenChange, onSuccess }: DeleteTaskDialogProps) {
    const [confirmName, setConfirmName] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const isConfirmed = confirmName.trim().toLowerCase() === task.name.trim().toLowerCase();

    const handleDelete = async () => {
        if (!isConfirmed) return;

        setIsDeleting(true);
        try {
            await tasksApi.deleteTask(task.id);
            toast.success('Task deleted successfully', {
                description: 'You can restore it within 30 days from the archive.',
            });
            onOpenChange(false);
            onSuccess?.();
        } catch (error: unknown) {
            console.error('Failed to delete task:', error);
            const err = error as { response?: { data?: { message?: string } } };
            toast.error('Failed to delete task', {
                description: err.response?.data?.message || 'An error occurred',
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
                        Delete Task
                    </DialogTitle>
                    <DialogDescription>
                        This action will delete the task <strong>"{task.name}"</strong>.
                        The task can be restored within 30 days.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-400">
                        <p className="font-medium">Warning:</p>
                        <ul className="mt-2 list-disc list-inside space-y-1">
                            <li>All statuses will be hidden</li>
                            <li>Assigned users will lose access</li>
                            <li>Active delegations will be cancelled</li>
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">
                            Type <span className="font-mono text-destructive">{task.name}</span> to confirm:
                        </label>
                        <Input
                            value={confirmName}
                            onChange={(e) => setConfirmName(e.target.value)}
                            placeholder="Enter task name"
                            className="font-mono"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={!isConfirmed || isDeleting}
                    >
                        {isDeleting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Deleting...
                            </>
                        ) : (
                            <>
                                <Trash2 className="mr-2 h-4 w-4" />
                                Delete Task
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
