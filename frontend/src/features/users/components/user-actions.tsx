import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { MoreHorizontal, Pencil, Trash, RotateCcw, Lock } from 'lucide-react';
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
import type { User } from '@/api/types';
import { useDeleteUser, useRestoreUser } from '@/hooks/use-users';

interface UserActionsProps {
    user: User; // We use User as value here? No, as type.
    onEdit: (user: User) => void;
    onResetPassword: (user: User) => void;
}

export function UserActions({ user, onEdit, onResetPassword }: UserActionsProps) {
    const { t } = useTranslation();
    const [showDeleteAlert, setShowDeleteAlert] = useState(false);
    const [showRestoreAlert, setShowRestoreAlert] = useState(false);
    const deleteUser = useDeleteUser();
    const restoreUser = useRestoreUser();

    const isDeleted = !!user.deletedAt;
    const isGuest = user.role === 'GUEST';

    const handleDelete = () => {
        deleteUser.mutate(user.id);
        setShowDeleteAlert(false);
    };

    const handleRestore = () => {
        restoreUser.mutate(user.id);
        setShowRestoreAlert(false);
    };

    return (
        <>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">{t('userMgmt.actions.openMenu')}</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
                    {/* A deleted account is restored first: no edit, no password reset. */}
                    {!isGuest && !isDeleted && (
                        <>
                            <DropdownMenuItem onClick={() => onEdit(user)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                {t('common.edit')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onResetPassword(user)}>
                                <Lock className="mr-2 h-4 w-4" />
                                {t('users.actions.resetPassword')}
                            </DropdownMenuItem>
                        </>
                    )}
                    {isGuest && (
                        <DropdownMenuItem disabled className="text-muted-foreground">
                            {t('userMgmt.actions.managedByGuestLinks')}
                        </DropdownMenuItem>
                    )}
                    {!isGuest && !isDeleted && <DropdownMenuSeparator />}
                    {!isGuest && (isDeleted ? (
                        <DropdownMenuItem
                            onClick={() => setShowRestoreAlert(true)}
                            className="text-green-600"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            {t('userMgmt.actions.restore')}
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={() => setShowDeleteAlert(true)}
                            className="text-destructive"
                        >
                            <Trash className="mr-2 h-4 w-4" />
                            {t('common.delete')}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.confirmDelete')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            <Trans
                                i18nKey="userMgmt.actions.deleteBody"
                                values={{ username: user.username }}
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

            <AlertDialog open={showRestoreAlert} onOpenChange={setShowRestoreAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('userMgmt.actions.restoreTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            <Trans
                                i18nKey="userMgmt.actions.restoreBody"
                                values={{ username: user.username }}
                                components={{ strong: <strong /> }}
                            />
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestore}>{t('userMgmt.actions.restore')}</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
