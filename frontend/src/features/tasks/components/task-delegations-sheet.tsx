import { useState } from 'react';
import { Plus, Trash, CalendarOff, Users, Clock } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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

    // For the dropdown selection
    const [tempUserId, setTempUserId] = useState<string>('');
    const [tempGroupId, setTempGroupId] = useState<string>('');

    const { data: allUsers } = useUsers();
    const { data: allGroups } = useGroups();

    const { data: delegations, isLoading: delegationsLoading } = useTaskDelegations(task?.id || 0);
    const createDelegation = useCreateDelegation();
    const deleteDelegation = useDeleteDelegation();

    if (!task) return null;

    const availableUsers = allUsers?.filter(u => !u.deletedAt && !selectedUserIds.includes(u.id)) || [];
    const availableGroups = allGroups?.filter(g => !selectedGroupIds.includes(g.id)) || [];

    const handleAddUser = () => {
        if (!tempUserId) return;
        setSelectedUserIds([...selectedUserIds, parseInt(tempUserId)]);
        setTempUserId('');
    };

    const handleAddGroup = () => {
        if (!tempGroupId) return;
        setSelectedGroupIds([...selectedGroupIds, parseInt(tempGroupId)]);
        setTempGroupId('');
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
        setTempUserId('');
        setTempGroupId('');
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

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[520px] sm:max-w-[520px] flex flex-col overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="text-xl flex items-center gap-2">
                        <CalendarOff className="h-5 w-5" /> {t('taskDelegations.title')}
                    </SheetTitle>
                    <SheetDescription>
                        <Trans
                            i18nKey="taskDelegations.description"
                            values={{ name: task.name }}
                            components={{ strong: <strong className="text-foreground" /> }}
                        />
                    </SheetDescription>
                </SheetHeader>

                <Separator className="my-4" />

                <div className="space-y-6">
                    {/* NEW DELEGATION FORM */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{t('taskDelegations.newDelegation')}</h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t('taskDelegations.startTime')}</Label>
                                <Input
                                    type="datetime-local"
                                    value={startAt}
                                    onChange={(e) => setStartAt(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{t('taskDelegations.endTime')}</Label>
                                <Input
                                    type="datetime-local"
                                    value={endAt}
                                    onChange={(e) => setEndAt(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{t('taskDelegations.reason')}</Label>
                            <Input
                                placeholder={t('taskDelegations.reasonPlaceholder')}
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                            />
                        </div>

                        {/* TARGET SELECTION */}
                        <div className="space-y-3 pt-2 border-t">
                            <Label>{t('taskDelegations.delegateToUsers')}</Label>
                            <div className="flex gap-2">
                                <Select value={tempUserId} onValueChange={setTempUserId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder={t('taskDelegations.selectUser')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id.toString()}>
                                                {user.fullname || user.username}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={handleAddUser} disabled={!tempUserId}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            {selectedUserIds.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {selectedUserIds.map(id => {
                                        const u = allUsers?.find(user => user.id === id);
                                        return (
                                            <div key={id} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md">
                                                {u?.fullname || u?.username || id}
                                                <Trash className="h-3 w-3 cursor-pointer ml-1 hover:text-destructive" onClick={() => handleRemoveSelectedUser(id)} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="space-y-3 pt-2 border-t">
                            <Label>{t('taskDelegations.delegateToGroups')}</Label>
                            <div className="flex gap-2">
                                <Select value={tempGroupId} onValueChange={setTempGroupId}>
                                    <SelectTrigger className="flex-1">
                                        <SelectValue placeholder={t('taskDelegations.selectGroup')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableGroups.map((group) => (
                                            <SelectItem key={group.id} value={group.id.toString()}>
                                                {group.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button variant="outline" onClick={handleAddGroup} disabled={!tempGroupId}>
                                    <Plus className="h-4 w-4" />
                                </Button>
                            </div>
                            {selectedGroupIds.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                    {selectedGroupIds.map(id => {
                                        const g = allGroups?.find(group => group.id === id);
                                        return (
                                            <div key={id} className="flex items-center gap-1 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded-md">
                                                {g?.name || id}
                                                <Trash className="h-3 w-3 cursor-pointer ml-1 hover:text-destructive" onClick={() => handleRemoveSelectedGroup(id)} />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <Button
                            className="w-full mt-2"
                            onClick={handleCreateDelegation}
                            disabled={createDelegation.isPending || (!startAt || !endAt) || (selectedUserIds.length === 0 && selectedGroupIds.length === 0)}
                        >
                            {createDelegation.isPending ? t('taskDelegations.creating') : t('taskDelegations.create')}
                        </Button>
                    </div>

                    <Separator />

                    {/* EXISTING DELEGATIONS */}
                    <div className="space-y-4">
                        <h3 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{t('taskDelegations.activeAndPlanned')}</h3>

                        {delegationsLoading ? (
                            <div className="text-sm text-muted-foreground">{t('taskDelegations.loading')}</div>
                        ) : delegations?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 text-center border rounded-lg bg-muted/20">
                                <CalendarOff className="h-8 w-8 text-muted-foreground/30 mb-2" />
                                <p className="text-muted-foreground text-sm">{t('taskDelegations.none')}</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {delegations?.map(del => (
                                    <Card key={del.id} className="shadow-sm">
                                        <CardContent className="p-4 flex flex-col gap-2 relative">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute top-2 right-2 h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleDeleteDelegation(del.id)}
                                                disabled={deleteDelegation.isPending}
                                            >
                                                <Trash className="h-3 w-3" />
                                            </Button>

                                            <div className="flex items-center gap-2 text-sm font-medium">
                                                <Clock className="h-4 w-4 text-blue-500" />
                                                {new Date(del.startAt).toLocaleDateString(dateCode)} - {new Date(del.endAt).toLocaleDateString(dateCode)}
                                            </div>

                                            {del.reason && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    {t('taskDelegations.reasonLine', { reason: del.reason })}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-1 flex-wrap mt-2">
                                                <Users className="h-3 w-3 text-muted-foreground mr-1" />
                                                {del.targetUsers?.map(tu => (
                                                    <span key={tu.userId} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                                        {tu.user.fullname || tu.user.username}
                                                    </span>
                                                ))}
                                                {del.targetGroups?.map(tg => (
                                                    <span key={tg.groupId} className="text-[10px] bg-orange-500/10 text-orange-700 px-1.5 py-0.5 rounded">
                                                        {tg.group.name}
                                                    </span>
                                                ))}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
