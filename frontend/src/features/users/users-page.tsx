import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/hooks/use-users';
import { Checkbox } from '@/components/ui/checkbox';
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

/** Pill colour per role. */
const ROLE_TONE: Record<string, string> = {
    SUPER_ADMIN: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    ADMIN: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400',
    MANAGER: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    USER: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
    GUEST: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function UsersList({ embedded = false }: UsersListProps) {
    const { t } = useTranslation();
    const [showDeleted, setShowDeleted] = useState(false);
    const { data: users, isLoading } = useUsers(showDeleted, true);

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
                            <h1 className="text-3xl font-bold tracking-tight">{t('users.title')}</h1>
                            <p className="text-muted-foreground">
                                {t('users.description')}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="lg" onClick={() => setIsGuestDialogOpen(true)}>
                                <Tv className="mr-2 h-4 w-4" />
                                {t('userMgmt.page.guestLinks')}
                            </Button>
                            <Button size="lg" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('users.addUser')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
            {/* ========== CONTENT CARD ========== */}
            <Card className="gap-0 overflow-hidden py-0 shadow-sm">
                {embedded && (
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-6 py-4">
                        <div className="flex items-start gap-3">
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <UsersIcon className="h-4 w-4" />
                            </span>
                            <div>
                                <h3 className="font-semibold leading-tight">{t('settings.usersManager')}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">{t('settings.usersManagerDescription')}</p>
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Button variant="outline" className="gap-2" onClick={() => setIsGuestDialogOpen(true)}>
                                <Tv className="h-4 w-4" />
                                {t('userMgmt.page.guestLinks')}
                            </Button>
                            <Button className="gap-2" onClick={handleCreate}>
                                <Plus className="h-4 w-4" />
                                {t('users.addUser')}
                            </Button>
                        </div>
                    </div>
                )}
                <CardHeader className="border-b bg-muted/30 py-3">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                            {isLoading ? t('common.loading') : t('userMgmt.page.count', { n: users?.length || 0 })}
                        </span>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Checkbox
                                checked={showDeleted}
                                onCheckedChange={(checked) => setShowDeleted(checked === true)}
                            />
                            {t('userMgmt.page.showDeleted')}
                        </label>
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
                            <h3 className="font-semibold text-lg">{t('userMgmt.page.emptyTitle')}</h3>
                            <p className="text-muted-foreground text-sm max-w-sm mt-1">
                                {t('userMgmt.page.emptyBody')}
                            </p>
                            <Button className="mt-6" onClick={handleCreate}>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('users.addUser')}
                            </Button>
                        </div>
                    ) : (
                        /* ========== TABLE ========== */
                        <Table>
                            <TableHeader>
                                <TableRow className="bg-muted/50 hover:bg-muted/50">
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        {t('userMgmt.page.columns.fullName')}
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        {t('userMgmt.page.columns.email')}
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        {t('userMgmt.page.columns.role')}
                                    </TableHead>
                                    <TableHead className="text-xs uppercase tracking-wide text-muted-foreground font-medium py-3 px-6">
                                        {t('userMgmt.page.columns.status')}
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
                                            <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_TONE[user.role] ?? ROLE_TONE.USER}`}>
                                                {t(`profilePage.roleBadge.${user.role}`, { defaultValue: user.role })}
                                            </span>
                                        </TableCell>
                                        <TableCell className="py-4 px-6">
                                            {user.deletedAt ? (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                                                    {t('users.status.deleted')}
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                                    {t('users.status.active')}
                                                </span>
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
