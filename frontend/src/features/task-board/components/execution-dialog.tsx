import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { tasksApi } from '@/api/tasks';
import { getErrorMessage } from '@/api/http';
import { useAuthStore } from '@/stores/auth-store';
import type { BoardItem, ExecutionSubmission } from '@/api/types';
import { DateInput } from '@/components/ui/date-input';
import { TargetPicker } from '@/components/target-picker';
import { applyAssignment, assignmentSections } from '@/features/todos/todo-assignment';

export function ExecutionDialog({ item, status, onClose, readOnly = false }: {
    item: BoardItem; status: 'SUCCESS' | 'FAILED'; onClose: () => void; readOnly?: boolean;
}) {
    const { t } = useTranslation();
    const client = useQueryClient();
    const role = useAuthStore(state => state.role);
    const canAssign = ['ADMIN', 'SUPER_ADMIN', 'MANAGER'].includes(role ?? '');
    const steps = readOnly ? (item.executionRecord ?? []) : (item.executionChecklist ?? []);
    const [values, setValues] = useState<Record<string, string | number | boolean>>({});
    const [comment, setComment] = useState('');
    const [createAction, setCreateAction] = useState(false);
    const [actionTitle, setActionTitle] = useState('');
    const [dueDate, setDueDate] = useState('');
    // Empty means the person submitting; otherwise `user:<id>` or `group:<id>`.
    const [target, setTarget] = useState<string[]>([]);
    const [uploading, setUploading] = useState(false);
    const assignees = useQuery({ queryKey: ['execution-assignees', item.taskId], queryFn: () => tasksApi.executionAssignees(item.taskId), enabled: createAction && canAssign });
    const save = useMutation({
        mutationKey: ['task-execution', item.taskId, item.instanceDate],
        mutationFn: (submission: ExecutionSubmission) => tasksApi.setStatus(item.taskId, item.instanceDate, status, comment || undefined, submission),
        onSuccess: async () => {
            await Promise.all([client.invalidateQueries({ queryKey: ['task-board'] }), client.invalidateQueries({ queryKey: ['corrective-actions'] }), client.invalidateQueries({ queryKey: ['analytics'] })]);
            toast.success(t('taskBoard.overrideSuccess'));
            onClose();
        },
        onError: error => toast.error(getErrorMessage(error, t('taskBoard.overrideError'))),
    });
    const busy = save.isPending || uploading;
    const complete = status === 'FAILED' || steps.every(step => !step.required || (step.kind === 'CHECK' ? values[step.id] === true : values[step.id] !== undefined && values[step.id] !== '' && String(values[step.id]).trim() !== ''));
    const submit = () => {
        const submission: ExecutionSubmission = {};
        if (steps.length) submission.executionAnswers = steps.filter(step => values[step.id] !== undefined && values[step.id] !== '').map(step => ({ id: step.id, value: values[step.id] }));
        if (createAction) {
            const { groupId, assigneeId } = applyAssignment(target);
            submission.correctiveAction = { title: actionTitle.trim(), dueDate: dueDate || undefined, assigneeId: assigneeId ? Number(assigneeId) : undefined, assigneeGroupId: groupId ? Number(groupId) : undefined };
        }
        save.mutate(submission);
    };
    const upload = async (stepId: string, file?: File) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { toast.error(t('execution.photoLimit')); return; }
        setUploading(true);
        try {
            const evidence = await tasksApi.uploadEvidence(item.taskId, item.instanceDate, file);
            setValues(current => ({ ...current, [stepId]: evidence.id }));
        } catch (error) { toast.error(getErrorMessage(error, t('execution.uploadFailed'))); }
        finally { setUploading(false); }
    };
    const download = async (id: string) => {
        try {
            const blob = await tasksApi.downloadEvidence(item.taskId, id);
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a'); anchor.href = url; anchor.download = `evidence-${id}.${blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg'}`; anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) { toast.error(getErrorMessage(error, t('execution.downloadFailed'))); }
    };
    return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>{readOnly ? t('execution.report') : status === 'FAILED' ? t('taskBoard.failDialogTitle') : t('execution.complete')}</DialogTitle>
                <DialogDescription>{item.taskName} · {item.instanceDate}</DialogDescription>
            </DialogHeader>
            <div className="space-y-5">
                {steps.map(step => {
                    const record = item.executionRecord?.find(answer => answer.id === step.id);
                    return <div key={step.id} className="space-y-2">
                        <Label htmlFor={`execution-${step.id}`}>{step.label}{step.required && !readOnly ? ' *' : ''}</Label>
                        {readOnly ? (step.kind === 'PHOTO' ? <Button variant="outline" onClick={() => download(String(record?.value))}>{t('execution.viewPhoto')}</Button> : <p className="text-sm whitespace-pre-wrap">{typeof record?.value === 'boolean' ? t(record.value ? 'execution.checked' : 'execution.unchecked') : String(record?.value ?? '')}</p>)
                            : step.kind === 'CHECK' ? <Checkbox id={`execution-${step.id}`} disabled={busy} checked={values[step.id] === true} onCheckedChange={checked => setValues(current => ({ ...current, [step.id]: checked === true }))} />
                            : step.kind === 'PHOTO' ? <><Input id={`execution-${step.id}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => { void upload(step.id, event.target.files?.[0]); }} /><p className="text-xs text-muted-foreground">{values[step.id] ? t('execution.photoReady') : t('execution.photoLimit')}</p></>
                            : <Input id={`execution-${step.id}`} type={step.kind === 'NUMBER' ? 'number' : 'text'} step={step.kind === 'NUMBER' ? 'any' : undefined} className={step.kind === 'NUMBER' ? '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none' : undefined} maxLength={2000} disabled={busy} value={String(values[step.id] ?? '')} onChange={event => setValues(current => ({ ...current, [step.id]: step.kind === 'NUMBER' && event.target.value !== '' ? Number(event.target.value) : event.target.value }))} />}
                    </div>;
                })}
                {!readOnly && <>
                    <Label htmlFor="execution-comment">{t('execution.comment')}</Label>
                    <Textarea id="execution-comment" placeholder={t('taskBoard.failCommentPlaceholder')} maxLength={2000} disabled={busy} value={comment} onChange={event => setComment(event.target.value)} />
                    {status === 'FAILED' && <div className="rounded-lg border p-4 space-y-3">
                        <Label className="flex items-center gap-2"><Checkbox checked={createAction} disabled={busy} onCheckedChange={checked => setCreateAction(checked === true)} />{t('execution.createCorrectiveAction')}</Label>
                        {createAction && <>
                            <Label htmlFor="action-title">{t('execution.actionTitle')}</Label>
                            <Input id="action-title" maxLength={255} disabled={busy} value={actionTitle} onChange={event => setActionTitle(event.target.value)} />
                            <Label htmlFor="action-due">{t('execution.dueDate')}</Label>
                            <DateInput id="action-due" disabled={busy} value={dueDate} onChange={setDueDate} />
                            {canAssign && <><Label htmlFor="action-assignee">{t('execution.assignee')}</Label>
                                <TargetPicker
                                    id="action-assignee"
                                    sections={assignmentSections(t, assignees.data?.groups, assignees.data?.users)}
                                    value={target}
                                    onChange={setTarget}
                                    noneLabel={t('execution.myself')}
                                    placeholder={t('execution.myself')}
                                    ariaLabel={t('execution.assignee')}
                                />
                                {target[0]?.startsWith('group:') && <p className="text-xs text-muted-foreground">{t('execution.assigneeTeamHint')}</p>}
                            </>}
                        </>}
                    </div>}
                </>}
                {save.isError && <p role="alert" className="text-sm text-destructive">{getErrorMessage(save.error, t('taskBoard.overrideError'))}</p>}
            </div>
            <DialogFooter>
                <Button variant="outline" disabled={busy} onClick={onClose}>{readOnly ? t('common.close') : t('common.cancel')}</Button>
                {!readOnly && <Button disabled={busy || !complete || (createAction && actionTitle.trim().length < 3)} variant={status === 'FAILED' ? 'destructive' : 'default'} onClick={submit}>{save.isPending ? t('execution.saving') : status === 'FAILED' ? t('taskBoard.confirmFail') : t('taskBoard.validate')}</Button>}
            </DialogFooter>
        </DialogContent>
    </Dialog>;
}
