import { useState } from 'react';
import { Plus, Trash, CalendarOff, CalendarClock, Users, Clock, Loader2, X } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { TargetPicker, type TargetPickerSection } from '@/components/target-picker';
import { Input } from '@/components/ui/input';
import { DateTimeInput } from '@/components/ui/date-time-input';
import { Label } from '@/components/ui/label';

import type { Task } from '@/api/types';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useTaskDelegations, useCreateDelegation, useDeleteDelegation } from '@/hooks/use-tasks';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';
import { getErrorMessage } from '@/api/http';
import { getDateLocale } from '@/lib/date-locale';

interface TaskDelegationsSheetProps {
    task: Task | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TaskDelegationsSheet({ task, open, onOpenChange }: TaskDelegationsSheetProps) {
    const { t } = useTranslation();
    const dateCode = getDateLocale().code;
    const [startAt, setStartAt] = useState('');
    const [endAt, setEndAt] = useState('');
    const [reason, setReason] = useState('');

    // We store selected user/group IDs in local state before creating the delegation
    const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([]);

    const { data: allUsers } = useUsers();
    const { data: allGroups } = useGroups();

    const { data: delegations, isLoading: delegationsLoading } = useTaskDelegations(task?.id || 0);
    const createDelegation = useCreateDelegation();
    const deleteDelegation = useDeleteDelegation();

    if (!task) return null;

    // Teams first: picking one covers everybody in it, now and later.
    const sections: TargetPickerSection[] = [
        {
            key: 'groups',
            label: t('targetPicker.teams'),
            items: (allGroups ?? []).map(g => ({
                value: `group:${g.id}`,
                label: g.name,
                hint: t('targetPicker.members', { count: g.memberCount }),
            })),
        },
        {
            key: 'users',
            label: t('targetPicker.people'),
            items: (allUsers ?? []).filter(u => !u.deletedAt).map(u => ({ value: `user:${u.id}`, label: u.fullname || u.username })),
        },
    ];
    const pickerValue = [...selectedGroupIds.map(id => `group:${id}`), ...selectedUserIds.map(id => `user:${id}`)];
    const handlePick = (values: string[]) => {
        const idsOf = (kind: string) => values.filter(v => v.startsWith(`${kind}:`)).map(v => parseInt(v.slice(kind.length + 1), 10));
        setSelectedGroupIds(idsOf('group'));
        setSelectedUserIds(idsOf('user'));
    };

    const handleRemoveSelectedUser = (id: number) => {
        setSelectedUserIds(selectedUserIds.filter(userId => userId !== id));
    };

    const handleRemoveSelectedGroup = (id: number) => {
        setSelectedGroupIds(selectedGroupIds.filter(groupId => groupId !== id));
    };

    const resetForm = () => {
        setStartAt('');
        setEndAt('');
        setReason('');
        setSelectedUserIds([]);
        setSelectedGroupIds([]);
    };

    const handleCreateDelegation = () => {
        if (!startAt || !endAt) {
            toast.error(t('taskDelegations.toasts.datesRequired'));
            return;
        }
        if (selectedUserIds.length === 0 && selectedGroupIds.length === 0) {
            toast.error(t('taskDelegations.toasts.targetRequired'));
            return;
        }

        createDelegation.mutate(
            {
                taskId: task.id,
                dto: {
                    startAt: new Date(startAt).toISOString(),
                    endAt: new Date(endAt).toISOString(),
                    reason: reason || undefined,
                    targetUserIds: selectedUserIds,
                    targetGroupIds: selectedGroupIds,
                }
            },
            {
                onSuccess: () => {
                    toast.success(t('taskDelegations.toasts.created'));
                    resetForm();
                },
                onError: (error: unknown) => {
                    toast.error(getErrorMessage(error, t('taskDelegations.toasts.createFailed')));
                },
            }
        );
    };

    const handleDeleteDelegation = (delegationId: number) => {
        deleteDelegation.mutate(
            { taskId: task.id, delegationId },
            {
                onSuccess: () => toast.success(t('taskDelegations.toasts.removed')),
                onError: () => toast.error(t('taskDelegations.toasts.removeFailed')),
            }
        );
    };

    const now = new Date();
    const statusOf = (startIso: string, endIso: string) => {
        const start = new Date(startIso);
        const end = new Date(endIso);
        if (end <= now) return 'ended' as const;
        if (start <= now) return 'active' as const;
        return 'planned' as const;
    };
    const STATUS_TONE = {
        active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        planned: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
        ended: 'bg-muted text-muted-foreground',
    };
    const formatDateTime = (iso: string) =>
        new Date(iso).toLocaleString(dateCode, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

    const chip = (key: string, label: string, onRemove: () => void, tone: string) => (
        <span key={key} className={`inline-flex items-center gap-1 rounded-full py-0.5 pl-2.5 pr-1 text-xs font-medium ${tone}`}>
            {label}
            <button
                type="button"
                aria-label={t('taskDelegations.removeTarget', { name: label })}
                className="flex h-4 w-4 items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                onClick={onRemove}
            >
                <X className="h-3 w-3" />
            </button>
        </span>
    );

    const canCreate = !createDelegation.isPending && !!startAt && !!endAt && (selectedUserIds.length > 0 || selectedGroupIds.length > 0);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
                <SheetHeader className="space-y-0 border-b p-6 text-left">
                    <div className="flex items-start gap-3 pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-700 dark:text-orange-400">
                            <CalendarClock className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <SheetTitle className="text-lg">{t('taskDelegations.title')}</SheetTitle>
                            <SheetDescription>
                                <Trans
                                    i18nKey="taskDelegations.description"
                                    values={{ name: task.name }}
                                    components={{ strong: <strong className="text-foreground" /> }}
                                />
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <div className="flex-1 space-y-6 overflow-y-auto p-6">
                    {/* NEW DELEGATION FORM */}
                    <section className="space-y-4 rounded-xl border bg-card p-4 shadow-sm">
                        <h3 className="flex items-center gap-2 text-sm font-semibold">
                            <Plus className="h-4 w-4 text-primary" />
                            {t('taskDelegations.newDelegation')}
                        </h3>

                        <div className="space-y-3">
                            <div className="space-y-1.5">
                                <Label htmlFor="delegation-start" className="text-xs">{t('taskDelegations.startTime')}</Label>
                                <DateTimeInput id="delegation-start" value={startAt} onChange={setStartAt} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="delegation-end" className="text-xs">{t('taskDelegations.endTime')}</Label>
                                <DateTimeInput id="delegation-end" value={endAt} onChange={setEndAt} defaultTime="23:55" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="delegation-reason" className="text-xs">{t('taskDelegations.reason')}</Label>
                            <Input
                                id="delegation-reason"
                                placeholder={t('taskDelegations.reasonPlaceholder')}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>

                        {/* TARGET SELECTION: one menu, tick as many teams and people as needed */}
                        <div className="space-y-2 rounded-lg bg-muted/30 p-3">
                            <Label htmlFor="delegation-targets" className="text-xs">{t('taskDelegations.delegateTo')}</Label>
                            <TargetPicker
                                id="delegation-targets"
                                multiple
                                sections={sections}
                                value={pickerValue}
                                onChange={handlePick}
                                placeholder={t('taskDelegations.delegateToPlaceholder')}
                                ariaLabel={t('taskDelegations.delegateTo')}
                            />
                            <p className="text-[11px] text-muted-foreground">{t('taskDelegations.delegateToHint')}</p>
                            {pickerValue.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {selectedGroupIds.map(id => {
                                        const g = allGroups?.find(group => group.id === id);
                                        return chip(`g${id}`, g?.name || String(id), () => handleRemoveSelectedGroup(id), 'bg-orange-500/10 text-orange-700 dark:text-orange-400');
                                    })}
                                    {selectedUserIds.map(id => {
                                        const u = allUsers?.find(user => user.id === id);
                                        return chip(`u${id}`, u?.fullname || u?.username || String(id), () => handleRemoveSelectedUser(id), 'bg-primary/10 text-primary');
                                    })}
                                </div>
                            )}
                        </div>

                        <Button className="w-full gap-2" onClick={handleCreateDelegation} disabled={!canCreate}>
                            {createDelegation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
                            {createDelegation.isPending ? t('taskDelegations.creating') : t('taskDelegations.create')}
                        </Button>
                    </section>

                    {/* EXISTING DELEGATIONS */}
                    <section className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('taskDelegations.activeAndPlanned')}</h3>

                        {delegationsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                {t('taskDelegations.loading')}
                            </div>
                        ) : delegations?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                                    <CalendarOff className="h-6 w-6 text-muted-foreground" />
                                </div>
                                <p className="text-sm text-muted-foreground">{t('taskDelegations.none')}</p>
                            </div>
                        ) : (
                            <ul className="space-y-2">
                                {delegations?.map(del => {
                                    const status = statusOf(del.startAt, del.endAt);
                                    return (
                                        <li key={del.id} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/25">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 space-y-1">
                                                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_TONE[status]}`}>
                                                        {t(`taskDelegations.status.${status}`)}
                                                    </span>
                                                    <p className="flex items-center gap-1.5 text-sm font-medium">
                                                        <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                                        {formatDateTime(del.startAt)} → {formatDateTime(del.endAt)}
                                                    </p>
                                                </div>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={t('taskDelegations.removeDelegation')}
                                                    title={t('taskDelegations.removeDelegation')}
                                                    className="h-8 w-8 shrink-0 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                                                    onClick={() => handleDeleteDelegation(del.id)}
                                                    disabled={deleteDelegation.isPending}
                                                >
                                                    <Trash className="h-4 w-4" />
                                                </Button>
                                            </div>

                                            {del.reason && (
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {t('taskDelegations.reasonLine', { reason: del.reason })}
                                                </p>
                                            )}

                                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                                                <Users className="mr-0.5 h-3.5 w-3.5 text-muted-foreground" />
                                                {del.targetUsers?.map(tu => (
                                                    <span key={tu.userId} className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                                                        {tu.user.fullname || tu.user.username}
                                                    </span>
                                                ))}
                                                {del.targetGroups?.map(tg => (
                                                    <span key={tg.groupId} className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[11px] font-medium text-orange-700 dark:text-orange-400">
                                                        {tg.group.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </section>
                </div>
            </SheetContent>
        </Sheet>
    );
}
