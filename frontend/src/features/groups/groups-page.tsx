import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useGroups } from '@/hooks/use-groups';
import { GroupActions } from './components/group-actions';
import { GroupFormDialog } from './components/group-form-dialog';
import { GroupMembersSheet } from './components/group-members-sheet';
import type { Group } from '@/api/types';

interface GroupsListProps {
    embedded?: boolean;
}

export function GroupsList({ embedded = false }: GroupsListProps) {
    const { data: groups, isLoading } = useGroups();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [groupToEdit, setGroupToEdit] = useState<Group | undefined>(undefined);
    const [groupToManage, setGroupToManage] = useState<Group | undefined>(undefined);

    const handleEdit = (group: Group) => {
        setGroupToEdit(group);
        setIsFormOpen(true);
    };

    const handleManageMembers = (group: Group) => {
        setGroupToManage(group);
    };

    const handleFormClose = (open: boolean) => {
        setIsFormOpen(open);
        if (!open) setGroupToEdit(undefined);
    };

    const handleCreate = () => {
        setGroupToEdit(undefined);
        setIsFormOpen(true);
    };

    return (
        <div className="space-y-6">
            {!embedded && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Groups</h1>
                            <p className="text-muted-foreground">
                                Organize users into groups for streamlined task assignment.
                            </p>
                        </div>
                        <Button size="lg" onClick={handleCreate}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Group
                        </Button>
                    </div>
                </div>
            )}
            {embedded && (
                <div className="flex justify-end">
                    <Button onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add Group
                    </Button>
                </div>
            )}

            <Card className="shadow-sm">
                <CardHeader className="border-b bg-muted/30 py-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            {isLoading ? 'Loading...' : `${groups?.length || 0} group(s)`}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 rounded-lg" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-32" />
                                        <Skeleton className="h-3 w-64" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : groups?.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="font-semibold text-lg">No groups yet</h3>
                            <p className="text-muted-foreground text-sm max-w-sm mt-1">
                                Create groups to organize users and simplify task assignments.
                            </p>
                            <Button className="mt-6" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add Group
                            </Button>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Name
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Site
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Members
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Description
                                    </TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {groups?.map((group) => (
                                    <TableRow
                                        key={group.id}
                                        className="hover:bg-muted/30 transition-colors"
                                    >
                                        <TableCell className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                                                    <Users className="h-4 w-4" />
                                                </div>
                                                <span className="font-medium">
                                                    {group.name}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            {group.site ? (
                                                <Badge variant="outline" className="font-normal">
                                                    {group.site.name}
                                                </Badge>
                                            ) : (
                                                <span className="text-muted-foreground">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <button
                                                onClick={() => handleManageMembers(group)}
                                                className="flex items-center gap-2 text-sm hover:underline text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                <Users className="h-3.5 w-3.5" />
                                                {group.memberCount ?? 0}
                                            </button>
                                        </TableCell>
                                        <TableCell className="py-4 px-6 text-muted-foreground max-w-xs truncate">
                                            {group.description || <span className="italic">No description</span>}
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <GroupActions
                                                group={group}
                                                onEdit={handleEdit}
                                                onManageMembers={handleManageMembers}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <GroupFormDialog
                open={isFormOpen}
                onOpenChange={handleFormClose}
                groupToEdit={groupToEdit}
            />

            <GroupMembersSheet
                group={groupToManage}
                open={!!groupToManage}
                onOpenChange={(open) => !open && setGroupToManage(undefined)}
            />
        </div>
    );
}
