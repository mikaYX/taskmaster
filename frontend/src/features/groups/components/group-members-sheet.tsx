import { useState, useMemo } from 'react';
import { Plus, Trash, Users, Search } from 'lucide-react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent } from '@/components/ui/card';

import type { Group } from '@/api/types';
import { useGroupMembers, useAddGroupMembers, useRemoveGroupMembers } from '@/hooks/use-groups';
import { useUsers } from '@/hooks/use-users';
import { toast } from 'sonner';
import { Trans, useTranslation } from 'react-i18next';

interface GroupMembersSheetProps {
    group: Group | undefined;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/**
 * Group Members Sheet.
 * 
 * Premium Admin Pattern:
 * - Sheet from right (non-blocking)
 * - Clear sections with separators
 * - Member cards with avatars
 * - Discrete remove action
 */
const normalize = (s: string) => (s ?? '').toLowerCase().trim();

export function GroupMembersSheet({ group, open, onOpenChange }: GroupMembersSheetProps) {
    const { t } = useTranslation();
    const [searchQuery, setSearchQuery] = useState('');

    const { data: members, isLoading: isLoadingMembers } = useGroupMembers(group?.id || 0);
    const { data: allUsers } = useUsers();

    const addMembers = useAddGroupMembers();
    const removeMembers = useRemoveGroupMembers();

    // Available users (not in group, not deleted)
    const availableUsers = useMemo(
        () => allUsers?.filter(
            user => !user.deletedAt && !members?.some(m => m.id === user.id)
        ) ?? [],
        [allUsers, members]
    );

    // Filter by search (fullname, username, email)
    const filteredUsers = useMemo(() => {
        const q = normalize(searchQuery);
        if (!q) return availableUsers;
        return availableUsers.filter(
            user =>
                normalize(user.fullname ?? '').includes(q) ||
                normalize(user.username).includes(q) ||
                normalize(user.email ?? '').includes(q)
        );
    }, [availableUsers, searchQuery]);

    if (!group) return null;

    const handleAddMember = (userId: number) => {
        addMembers.mutate(
            { id: group.id, dto: { userIds: [userId] } },
            {
                onSuccess: () => toast.success(t('groupMgmt.members.toasts.added')),
                onError: () => toast.error(t('groupMgmt.members.toasts.addFailed')),
            }
        );
    };

    const handleRemoveMember = (userId: number) => {
        removeMembers.mutate(
            { id: group.id, dto: { userIds: [userId] } },
            {
                onSuccess: () => toast.success(t('groupMgmt.members.toasts.removed')),
                onError: () => toast.error(t('groupMgmt.members.toasts.removeFailed')),
            }
        );
    };

    const isLoadingAction = addMembers.isPending || removeMembers.isPending;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="w-[480px] sm:max-w-[480px] flex flex-col">
                <SheetHeader>
                    <SheetTitle className="text-xl">{t('groupMgmt.members.title')}</SheetTitle>
                    <SheetDescription>
                        <Trans
                            i18nKey="groupMgmt.members.description"
                            values={{ name: group.name }}
                            components={{ strong: <strong className="text-foreground" /> }}
                        />
                    </SheetDescription>
                </SheetHeader>

                <Separator className="my-4" />

                {/* ========== ADD MEMBER SECTION ========== */}
                <div className="space-y-3 px-4">
                    <h4 className="text-sm font-medium">{t('groupMgmt.members.addTitle')}</h4>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            type="search"
                            placeholder={t('groupMgmt.members.searchPlaceholder')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-9"
                            disabled={isLoadingAction}
                        />
                    </div>
                    <div className="border rounded-md max-h-[220px] overflow-y-auto">
                        {availableUsers.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                {t('groupMgmt.members.noneToAdd')}
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                {t('groupMgmt.members.noResults', { query: searchQuery })}
                            </div>
                        ) : (
                            <ul className="p-1">
                                {filteredUsers.map((user) => (
                                    <li
                                        key={user.id}
                                        className="flex items-center justify-between gap-2 rounded-sm px-2 py-2 hover:bg-muted/50"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <div className="font-medium text-sm truncate">
                                                {user.fullname || user.username}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {user.email || user.username}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="shrink-0 h-8"
                                            onClick={() => handleAddMember(user.id)}
                                            disabled={isLoadingAction}
                                        >
                                            <Plus className="h-4 w-4 mr-1" />
                                            {t('groupMgmt.members.add')}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                <Separator className="my-4" />

                {/* ========== MEMBERS LIST ========== */}
                <div className="flex-1 overflow-hidden flex flex-col px-4 pb-4">
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-medium">{t('groupMgmt.members.current')}</h4>
                        <span className="text-xs text-muted-foreground">
                            {t('groupMgmt.members.count', { n: members?.length || 0 })}
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {isLoadingMembers ? (
                            <div className="text-center py-8 text-muted-foreground">
                                {t('groupMgmt.members.loading')}
                            </div>
                        ) : members?.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                                <p className="text-muted-foreground text-sm">
                                    {t('groupMgmt.members.empty')}
                                </p>
                                <p className="text-muted-foreground text-xs mt-1">
                                    {t('groupMgmt.members.emptyHint')}
                                </p>
                            </div>
                        ) : (
                            members?.map((member) => (
                                <Card key={member.id} className="shadow-none">
                                    <CardContent className="flex items-center justify-between p-3">
                                        <div className="flex items-center gap-3">
                                            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                                                {(member.fullname || member.username || '?').substring(0, 2).toUpperCase()}
                                            </div>
                                            <div>
                                                <div className="font-medium text-sm">
                                                    {member.fullname || member.username}
                                                </div>
                                                <div className="text-xs text-muted-foreground">
                                                    {member.email || member.username}
                                                </div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                            onClick={() => handleRemoveMember(member.id)}
                                            disabled={isLoadingAction}
                                        >
                                            <Trash className="h-4 w-4" />
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </div>
            </SheetContent>
        </Sheet>
    );
}
