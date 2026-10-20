import { useState } from 'react';
import { Plus, Trash, Users, UsersRound } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Task } from '@/api/types';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useAssignUsers, useUnassignUsers, useAssignGroups, useUnassignGroups } from '@/hooks/use-tasks';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';

interface TaskAssignmentsSheetProps {
    task: Task | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Task Assignments Sheet.
 * 
 * Manages user and group assignments for a task.
 * Uses tabs to separate Users and Groups.
 */
export function TaskAssignmentsSheet({ task, open, onOpenChange }: TaskAssignmentsSheetProps) {
    const { t } = useTranslation();
    const [selectedUserId, setSelectedUserId] = useState<string>('');
    const [selectedGroupId, setSelectedGroupId] = useState<string>('');

    const { data: allUsers } = useUsers();
    const { data: allGroups } = useGroups();

    const assignUsers = useAssignUsers();
    const unassignUsers = useUnassignUsers();
    const assignGroups = useAssignGroups();
    const unassignGroups = useUnassignGroups();

    if (!task) return null;

    // Assigned entities
    const assignedUsers = allUsers?.filter(u => task.assignedUserIds?.includes(u.id)) || [];
    const assignedGroups = allGroups?.filter(g => task.assignedGroupIds?.includes(g.id)) || [];

    // Available entities (not already assigned)
    const availableUsers = allUsers?.filter(
        u => !u.deletedAt && !task.assignedUserIds?.includes(u.id)
    ) || [];
    const availableGroups = allGroups?.filter(
        g => !task.assignedGroupIds?.includes(g.id)
    ) || [];

    const handleAddUser = () => {
        if (!selectedUserId) return;
        assignUsers.mutate(
            { id: task.id, dto: { ids: [parseInt(selectedUserId)] } },
            {
                onSuccess: () => {
                    setSelectedUserId('');
                    toast.success(t('taskAssignments.toasts.userAssigned'));
                },
                onError: () => toast.error(t('taskAssignments.toasts.userAssignFailed')),
            }
        );
    };

    const handleRemoveUser = (userId: number) => {
        unassignUsers.mutate(
            { id: task.id, dto: { ids: [userId] } },
            {
                onSuccess: () => toast.success(t('taskAssignments.toasts.userUnassigned')),
                onError: () => toast.error(t('taskAssignments.toasts.userUnassignFailed')),
            }
        );
    };

    const handleAddGroup = () => {
        if (!selectedGroupId) return;
        assignGroups.mutate(
            { id: task.id, dto: { ids: [parseInt(selectedGroupId)] } },
            {
                onSuccess: () => {
                    setSelectedGroupId('');
                    toast.success(t('taskAssignments.toasts.groupAssigned'));
                },
                onError: () => toast.error(t('taskAssignments.toasts.groupAssignFailed')),
            }
        );
    };

    const handleRemoveGroup = (groupId: number) => {
        unassignGroups.mutate(
            { id: task.id, dto: { ids: [groupId] } },
            {
                onSuccess: () => toast.success(t('taskAssignments.toasts.groupUnassigned')),
                onError: () => toast.error(t('taskAssignments.toasts.groupUnassignFailed')),
            }
        );
    };

    const isLoading = assignUsers.isPending || unassignUsers.isPending ||
        assignGroups.isPending || unassignGroups.isPending;

    const renderAdd = (
        value: string,
        onChange: (v: string) => void,
        placeholder: string,
        emptyLabel: string,
        options: { id: number; label: string }[],
        onAdd: () => void,
    ) => (
        <div className="flex gap-2 rounded-xl border bg-muted/30 p-2">
            <Select value={value} onValueChange={onChange} disabled={isLoading}>
                <SelectTrigger className="flex-1 bg-background">
                    <SelectValue placeholder={placeholder} />
                </SelectTrigger>
                <SelectContent>
                    {options.length === 0 ? (
                        <SelectItem value="__none__" disabled>
                            {emptyLabel}
                        </SelectItem>
                    ) : (
                        options.map((option) => (
                            <SelectItem key={option.id} value={option.id.toString()}>
                                {option.label}
                            </SelectItem>
                        ))
                    )}
                </SelectContent>
            </Select>
            <Button onClick={onAdd} disabled={!value || value === '__none__' || isLoading} className="gap-1.5">
                <Plus className="h-4 w-4" />
                {t('taskAssignments.add')}
            </Button>
        </div>
    );

    const renderEmpty = (Icon: typeof Users, text: string) => (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Icon className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    );

    const removeButton = (label: string, onClick: () => void) => (
        <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            title={label}
            className="h-8 w-8 shrink-0 text-muted-foreground transition-opacity hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
            onClick={onClick}
            disabled={isLoading}
        >
            <Trash className="h-4 w-4" />
        </Button>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-[520px]">
                <SheetHeader className="space-y-0 border-b p-6 text-left">
                    <div className="flex items-start gap-3 pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-700 dark:text-violet-400">
                            <Users className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <SheetTitle className="text-lg">{t('taskAssignments.title')}</SheetTitle>
                            <SheetDescription>
                                <Trans
                                    i18nKey="taskAssignments.description"
                                    values={{ name: task.name }}
                                    components={{ strong: <strong className="text-foreground" /> }}
                                />
                            </SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <Tabs defaultValue="users" className="flex min-h-0 flex-1 flex-col gap-0 p-6">
                    <TabsList className="grid h-10 w-full grid-cols-2">
                        <TabsTrigger value="users" className="gap-2">
                            <Users className="h-4 w-4" />
                            {t('taskAssignments.usersTab', { n: assignedUsers.length })}
                        </TabsTrigger>
                        <TabsTrigger value="groups" className="gap-2">
                            <UsersRound className="h-4 w-4" />
                            {t('taskAssignments.groupsTab', { n: assignedGroups.length })}
                        </TabsTrigger>
                    </TabsList>

                    {/* ========== USERS TAB ========== */}
                    <TabsContent value="users" className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                        {renderAdd(
                            selectedUserId,
                            setSelectedUserId,
                            t('taskAssignments.selectUser'),
                            t('taskAssignments.noUsersAvailable'),
                            availableUsers.map((u) => ({ id: u.id, label: u.fullname || u.username })),
                            handleAddUser,
                        )}

                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                            {assignedUsers.length === 0
                                ? renderEmpty(Users, t('taskAssignments.noUsersAssigned'))
                                : assignedUsers.map((user) => (
                                    <div
                                        key={user.id}
                                        className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/25 hover:bg-accent/30"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/5 text-sm font-semibold text-primary">
                                                {(user.fullname || user.username || '?').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{user.fullname || user.username}</div>
                                                <div className="truncate text-xs text-muted-foreground">{user.email || user.username}</div>
                                            </div>
                                        </div>
                                        {removeButton(t('taskAssignments.remove'), () => handleRemoveUser(user.id))}
                                    </div>
                                ))}
                        </div>
                    </TabsContent>

                    {/* ========== GROUPS TAB ========== */}
                    <TabsContent value="groups" className="mt-4 flex min-h-0 flex-1 flex-col gap-4">
                        {renderAdd(
                            selectedGroupId,
                            setSelectedGroupId,
                            t('taskAssignments.selectGroup'),
                            t('taskAssignments.noGroupsAvailable'),
                            availableGroups.map((g) => ({ id: g.id, label: g.name })),
                            handleAddGroup,
                        )}

                        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
                            {assignedGroups.length === 0
                                ? renderEmpty(UsersRound, t('taskAssignments.noGroupsAssigned'))
                                : assignedGroups.map((group) => (
                                    <div
                                        key={group.id}
                                        className="group flex items-center justify-between gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary/25 hover:bg-accent/30"
                                    >
                                        <div className="flex min-w-0 items-center gap-3">
                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-400">
                                                <UsersRound className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{group.name}</div>
                                                <div className="truncate text-xs text-muted-foreground">
                                                    {group.description || t('taskAssignments.noDescription')}
                                                </div>
                                            </div>
                                        </div>
                                        {removeButton(t('taskAssignments.remove'), () => handleRemoveGroup(group.id))}
                                    </div>
                                ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
