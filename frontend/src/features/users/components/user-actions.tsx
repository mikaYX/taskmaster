import { useState } from 'react';
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
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Actions</DropdownMenuLabel>
                    {!isGuest && (
                        <>
                            <DropdownMenuItem onClick={() => onEdit(user)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onResetPassword(user)}>
                                <Lock className="mr-2 h-4 w-4" />
                                Reset Password
                            </DropdownMenuItem>
                        </>
                    )}
                    {isGuest && (
                        <DropdownMenuItem disabled className="text-muted-foreground">
                            Géré par Guest TV Links
                        </DropdownMenuItem>
                    )}
                    {!isGuest && <DropdownMenuSeparator />}
                    {!isGuest && (isDeleted ? (
                        <DropdownMenuItem
                            onClick={() => setShowRestoreAlert(true)}
                            className="text-green-600"
                        >
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restore
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem
                            onClick={() => setShowDeleteAlert(true)}
                            className="text-destructive"
                        >
                            <Trash className="mr-2 h-4 w-4" />
                            Delete
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action will soft-delete the user <strong>{user.username}</strong>.
                            They will no longer be able to login, but data is preserved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showRestoreAlert} onOpenChange={setShowRestoreAlert}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore User?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will restore access for <strong>{user.username}</strong>.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRestore}>Restore</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
