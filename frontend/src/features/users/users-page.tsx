import { useState } from 'react';
import { Plus, Users as UsersIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/hooks/use-users';
import { UserActions } from './components/user-actions';
import { UserFormDialog } from './components/user-form-dialog';
import { ResetPasswordDialog } from './components/reset-password-dialog';
import { GuestLinkDialog } from './components/guest-link-dialog';
import { Tv } from 'lucide-react';
import type { User } from '@/api/types';

/**
 * Users Management Page.
 * 
 * Premium Admin Pattern:
 * - Header Section with title, description, CTA
 * - Card-wrapped Table
 * - Dropdown actions per row
 * - Dialog for create/edit
 */
interface UsersListProps {
    embedded?: boolean;
}

export function UsersList({ embedded = false }: UsersListProps) {
    const { data: users, isLoading } = useUsers();

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isGuestDialogOpen, setIsGuestDialogOpen] = useState(false);
    const [userToEdit, setUserToEdit] = useState<User | undefined>(undefined);
    const [userToReset, setUserToReset] = useState<User | null>(null);

    const handleEdit = (user: User) => {
        setUserToEdit(user);
        setIsFormOpen(true);
    };

    const handleFormClose = (open: boolean) => {
        setIsFormOpen(open);
        if (!open) setUserToEdit(undefined);
    };

    const handleCreate = () => {
        setUserToEdit(undefined);
        setIsFormOpen(true);
    };

    return (
        <div className="space-y-6">
            {/* ========== HEADER SECTION ========== */}
            {!embedded && (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                            <p className="text-muted-foreground">
                                Manage user accounts, roles, and permissions.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="lg" onClick={() => setIsGuestDialogOpen(true)}>
                                <Tv className="mr-2 h-4 w-4" />
                                Guest TV Links
                            </Button>
                            <Button size="lg" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add User
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {embedded && (
                <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsGuestDialogOpen(true)}>
                        <Tv className="mr-2 h-4 w-4" />
                        Guest TV Links
                    </Button>
                    <Button onClick={handleCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Add User
                    </Button>
                </div>
            )}

            {/* ========== CONTENT CARD ========== */}
            <Card className="shadow-sm">
                <CardHeader className="border-b bg-muted/30 py-4">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            {isLoading ? 'Loading...' : `${users?.length || 0} user(s)`}
                        </span>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-6 space-y-4">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="flex items-center gap-4">
                                    <Skeleton className="h-10 w-10 rounded-full" />
                                    <div className="space-y-2 flex-1">
                                        <Skeleton className="h-4 w-48" />
                                        <Skeleton className="h-3 w-32" />
                                    </div>
                                    <Skeleton className="h-6 w-16" />
                                </div>
                            ))}
                        </div>
                    ) : users?.length === 0 ? (
                        /* ========== EMPTY STATE ========== */
                        <div className="flex flex-col items-center justify-center py-16 text-center">
                            <UsersIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
                            <h3 className="font-semibold text-lg">No users yet</h3>
                            <p className="text-muted-foreground text-sm max-w-sm mt-1">
                                Get started by creating your first user account.
                            </p>
                            <Button className="mt-6" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                Add User
                            </Button>
                        </div>
                    ) : (
                        /* ========== TABLE ========== */
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Full Name
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Email
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Role
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        Status
                                    </TableHead>
                                    <TableHead className="w-[60px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {users?.map((user) => (
                                    <TableRow
                                        key={user.id}
                                        className={`hover:bg-muted/30 transition-colors ${user.deletedAt ? 'opacity-50 bg-muted/20' : ''}`}
                                    >
                                        <TableCell className="py-4 px-6">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                                                    {(user.fullname || user.username || '?').substring(0, 2).toUpperCase()}
                                                </div>
                                                <span className="font-medium">
                                                    {user.fullname || user.username}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4 px-6 text-muted-foreground">
                                            {user.email || user.username}
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <Badge
                                                variant={user.role === 'ADMIN' ? 'default' : user.role === 'GUEST' ? 'outline' : 'secondary'}
                                            >
                                                {user.role}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            {user.deletedAt ? (
                                                <Badge variant="destructive">Deleted</Badge>
                                            ) : (
                                                <Badge variant="secondary">Active</Badge>
                                            )}
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            <UserActions
                                                user={user}
                                                onEdit={handleEdit}
                                                onResetPassword={setUserToReset}
                                            />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* ========== DIALOGS ========== */}
            <UserFormDialog
                open={isFormOpen}
                onOpenChange={handleFormClose}
                userToEdit={userToEdit}
            />

            <ResetPasswordDialog
                user={userToReset}
                open={!!userToReset}
                onOpenChange={(open) => !open && setUserToReset(null)}
            />
            <GuestLinkDialog
                open={isGuestDialogOpen}
                onOpenChange={setIsGuestDialogOpen}
            />
        </div>
    );
}
