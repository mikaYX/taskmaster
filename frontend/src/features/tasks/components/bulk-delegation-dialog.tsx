import { useState } from 'react';
import { CalendarClock, Loader2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Label } from '@/components/ui/label';
import { TargetPicker } from '@/components/target-picker';
import { assignmentSections } from '@/features/todos/todo-assignment';
import { getErrorMessage } from '@/api/http';
import { useGroups } from '@/hooks/use-groups';
import { useUsers } from '@/hooks/use-users';
import { useCreateBulkDelegation } from '@/hooks/use-tasks';
import type { BulkDelegationResult, Task } from '@/api/types';

interface BulkDelegationDialogProps {
    tasks: Task[];
    open: boolean;
    /** `done` is true once delegations were created, so the page can drop its selection. */
    onClose: (done: boolean) => void;
}

/** One delegation (dates, reason, people and teams) applied to every selected task. */
export function BulkDelegationDialog({ tasks, open, onClose }: BulkDelegationDialogProps) {
    const { t } = useTranslation();
    const [startAt, setStartAt] = useState('');
    const [endAt, setEndAt] = useState('');
    const [reason, setReason] = useState('');
    const [targets, setTargets] = useState<string[]>([]);
    const [result, setResult] = useState<BulkDelegationResult>();

    const { data: users } = useUsers(false, false, open);
    const { data: groups } = useGroups(open);
    const createMany = useCreateBulkDelegation();

    const idsOf = (kind: string) => targets.filter(v => v.startsWith(`${kind}:`)).map(v => parseInt(v.slice(kind.length + 1), 10));
    const canSubmit = !!startAt && !!endAt && targets.length > 0 && tasks.length > 0 && !createMany.isPending;

    const submit = () => {
        createMany.mutate(
            {
                taskIds: tasks.map(task => task.id),
                startAt: new Date(startAt).toISOString(),
                endAt: new Date(endAt).toISOString(),
                reason: reason || undefined,
                targetUserIds: idsOf('user'),
                targetGroupIds: idsOf('group'),
            },
            {
                onSuccess: (data) => {
                    if (data.failed.length === 0) {
                        toast.success(t('taskDelegations.bulk.allCreated', { count: data.created.length }));
                        onClose(true);
                    } else {
                        setResult(data);
                    }
                },
                onError: (error: unknown) => toast.error(getErrorMessage(error, t('taskDelegations.toasts.createFailed'))),
            },
        );
    };

    return (
        <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(!!result); }}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <CalendarClock className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        {t('taskDelegations.bulk.title', { count: tasks.length })}
                    </DialogTitle>
                    <DialogDescription>{t('taskDelegations.bulk.description')}</DialogDescription>
                </DialogHeader>

                {result ? (
                    <div className="space-y-3" role="status">
                        <p className="text-sm font-medium">{t('taskDelegations.bulk.createdCount', { count: result.created.length })}</p>
                        <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                                <TriangleAlert className="h-4 w-4" />
                                {t('taskDelegations.bulk.partial', { count: result.failed.length })}
                            </p>
                            <ul className="space-y-1 text-sm">
                                {result.failed.map(item => (
                                    <li key={item.taskId}>
                                        <span className="font-medium">{item.taskName ?? `#${item.taskId}`}</span>
                                        <span className="text-muted-foreground"> · {item.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <DialogFooter>
                            <Button onClick={() => onClose(true)}>{t('taskDelegations.bulk.close')}</Button>
                        </DialogFooter>
                    </div>
                ) : (
                    <div className="space-y-4">
                        <ul className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
                            {tasks.map(task => (
                                <li key={task.id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">{task.name}</li>
                            ))}
                        </ul>
                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="bulk-delegation-start" className="text-xs">{t('taskDelegations.startTime')}</Label>
                                <DateTimeInput id="bulk-delegation-start" value={startAt} onChange={setStartAt} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="bulk-delegation-end" className="text-xs">{t('taskDelegations.endTime')}</Label>
                                <DateTimeInput id="bulk-delegation-end" value={endAt} onChange={setEndAt} defaultTime="23:55" />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bulk-delegation-reason" className="text-xs">{t('taskDelegations.reason')}</Label>
                            <Input id="bulk-delegation-reason" placeholder={t('taskDelegations.reasonPlaceholder')} value={reason} onChange={e => setReason(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="bulk-delegation-targets" className="text-xs">{t('taskDelegations.delegateTo')}</Label>
                            <TargetPicker
                                id="bulk-delegation-targets"
                                multiple
                                sections={assignmentSections(t, groups, users?.filter(u => !u.deletedAt))}
                                value={targets}
                                onChange={setTargets}
                                placeholder={t('taskDelegations.delegateToPlaceholder')}
                                ariaLabel={t('taskDelegations.delegateTo')}
                            />
                            <p className="text-[11px] text-muted-foreground">{t('taskDelegations.delegateToHint')}</p>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => onClose(false)} disabled={createMany.isPending}>{t('common.cancel')}</Button>
                            <Button onClick={submit} disabled={!canSubmit} className="gap-2">
                                {createMany.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                                {t('taskDelegations.bulk.submit')}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
