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
import { Separator } from '@/components/ui/separator';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import type { Task } from '@/api/types';
import { useUsers } from '@/hooks/use-users';
import { useGroups } from '@/hooks/use-groups';
import { useAssignUsers, useUnassignUsers, useAssignGroups, useUnassignGroups } from '@/hooks/use-tasks';
import { toast } from 'sonner';

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
                    toast.success('User assigned');
                },
                onError: () => toast.error('Failed to assign user'),
            }
        );
    };

    const handleRemoveUser = (userId: number) => {
        unassignUsers.mutate(
            { id: task.id, dto: { ids: [userId] } },
            {
                onSuccess: () => toast.success('User unassigned'),
                onError: () => toast.error('Failed to unassign user'),
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
                    toast.success('Group assigned');
                },
                onError: () => toast.error('Failed to assign group'),
            }
        );
    };

    const handleRemoveGroup = (groupId: number) => {
        unassignGroups.mutate(
            { id: task.id, dto: { ids: [groupId] } },
            {
                onSuccess: () => toast.success('Group unassigned'),
                onError: () => toast.error('Failed to unassign group'),
            }
        );
    };

    const isLoading = assignUsers.isPending || unassignUsers.isPending ||
        assignGroups.isPending || unassignGroups.isPending;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[520px] sm:max-w-[520px] flex flex-col">
                <SheetHeader>
                    <SheetTitle className="text-xl">Task Assignments</SheetTitle>
                    <SheetDescription>
                        Manage who is responsible for <strong className="text-foreground">{task.name}</strong>
                    </SheetDescription>
                </SheetHeader>

                <Separator className="my-4" />

                <Tabs defaultValue="users" className="flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="users" className="gap-2">
                            <Users className="h-4 w-4" />
                            Users ({assignedUsers.length})
                        </TabsTrigger>
                        <TabsTrigger value="groups" className="gap-2">
                            <UsersRound className="h-4 w-4" />
                            Groups ({assignedGroups.length})
                        </TabsTrigger>
                    </TabsList>

                    {/* ========== USERS TAB ========== */}
                    <TabsContent value="users" className="flex-1 flex flex-col mt-4 space-y-4">
                        {/* Add User */}
                        <div className="flex gap-2">
                            <Select
                                value={selectedUserId}
                                onValueChange={setSelectedUserId}
                                disabled={isLoading}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select a user..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableUsers.length === 0 ? (
                                        <SelectItem value="__none__" disabled>
                                            No users available
                                        </SelectItem>
                                    ) : (
                                        availableUsers.map((user) => (
                                            <SelectItem key={user.id} value={user.id.toString()}>
                                                {user.fullname || user.username}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleAddUser}
                                disabled={!selectedUserId || selectedUserId === '__none__' || isLoading}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add
                            </Button>
                        </div>

                        {/* Assigned Users List */}
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {assignedUsers.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                    <p className="text-muted-foreground text-sm">No users assigned to this task.</p>
                                </div>
                            ) : (
                                assignedUsers.map((user) => (
                                    <Card key={user.id} className="shadow-none">
                                        <CardContent className="flex items-center justify-between p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                                                    {(user.fullname || user.username || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">
                                                        {user.fullname || user.username}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {user.email || user.username}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleRemoveUser(user.id)}
                                                disabled={isLoading}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </TabsContent>

                    {/* ========== GROUPS TAB ========== */}
                    <TabsContent value="groups" className="flex-1 flex flex-col mt-4 space-y-4">
                        {/* Add Group */}
                        <div className="flex gap-2">
                            <Select
                                value={selectedGroupId}
                                onValueChange={setSelectedGroupId}
                                disabled={isLoading}
                            >
                                <SelectTrigger className="flex-1">
                                    <SelectValue placeholder="Select a group..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableGroups.length === 0 ? (
                                        <SelectItem value="__none__" disabled>
                                            No groups available
                                        </SelectItem>
                                    ) : (
                                        availableGroups.map((group) => (
                                            <SelectItem key={group.id} value={group.id.toString()}>
                                                {group.name}
                                            </SelectItem>
                                        ))
                                    )}
                                </SelectContent>
                            </Select>
                            <Button
                                onClick={handleAddGroup}
                                disabled={!selectedGroupId || selectedGroupId === '__none__' || isLoading}
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add
                            </Button>
                        </div>

                        {/* Assigned Groups List */}
                        <div className="flex-1 overflow-y-auto space-y-2">
                            {assignedGroups.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-12 text-center">
                                    <UsersRound className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                    <p className="text-muted-foreground text-sm">No groups assigned to this task.</p>
                                </div>
                            ) : (
                                assignedGroups.map((group) => (
                                    <Card key={group.id} className="shadow-none">
                                        <CardContent className="flex items-center justify-between p-3">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <UsersRound className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <div className="font-medium text-sm">{group.name}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {group.description || 'No description'}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                                onClick={() => handleRemoveGroup(group.id)}
                                                disabled={isLoading}
                                            >
                                                <Trash className="h-4 w-4" />
                                            </Button>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </TabsContent>
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
