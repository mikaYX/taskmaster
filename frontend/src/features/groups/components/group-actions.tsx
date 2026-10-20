import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Trash, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Group } from '@/api/types';
import { useDeleteGroup } from '@/hooks/use-groups';

interface GroupActionsProps {
    group: Group;
    onEdit: (group: Group) => void;
    onManageMembers: (group: Group) => void;
}

export function GroupActions({ group, onEdit, onManageMembers }: GroupActionsProps) {
    const { t } = useTranslation();
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const deleteGroup = useDeleteGroup();

    const handleDelete = () => {
        deleteGroup.mutate(group.id);
        setShowDeleteAlert(false);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">{t('groupMgmt.actions.openMenu')}</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
                    <DropdownMenuItem onClick={() => onEdit(group)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        {t('groupMgmt.actions.editDetails')}
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onManageMembers(group)}>
                        <Users className="mr-2 h-4 w-4" />
                        {t('groupMgmt.actions.manageMembers')}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => setShowDeleteAlert(true)}
                        className="text-destructive"
                    >
                        <Trash className="mr-2 h-4 w-4" />
                        {t('groupMgmt.actions.deleteGroup')}
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('groupMgmt.actions.deleteTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            <Trans
                                i18nKey="groupMgmt.actions.deleteBody"
                                values={{ name: group.name }}
                                components={{ strong: <strong /> }}
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('common.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
