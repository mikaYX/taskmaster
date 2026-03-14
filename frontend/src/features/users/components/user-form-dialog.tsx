import { useEffect, useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import type { User } from '@/api/types';
import { sitesApi } from '@/api/sites';
import { useCreateUser, useUpdateUser } from '@/hooks/use-users';
import { useIsSuperAdmin } from '@/stores/auth-store';
import { NewPasswordDialog } from './new-password-dialog';

function generateRandomPassword(length = 12): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

const userSchema = z.object({
    firstname: z.string().min(1, 'First name is required'),
    lastname: z.string().min(1, 'Last name is required'),
    email: z.string().email('Invalid email address'),
    role: z.enum(['SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST'] as const),
    siteId: z.number().optional(),
});

type UserFormValues = z.infer<typeof userSchema>;

interface UserFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userToEdit?: User;
}

export function UserFormDialog({ open, onOpenChange, userToEdit }: UserFormDialogProps) {
    const createUser = useCreateUser();
    const updateUser = useUpdateUser();
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [createdUserEmail, setCreatedUserEmail] = useState('');
    const isSuperAdmin = useIsSuperAdmin();

    const isEdit = !!userToEdit;

    const { data: sitesData } = useQuery({
        queryKey: ['sites'],
        queryFn: () => sitesApi.findAll(),
        enabled: open,
    });

    const sites = useMemo(() => sitesData || [], [sitesData]);

    const form = useForm<UserFormValues>({
        resolver: zodResolver(userSchema),
        defaultValues: {
            firstname: '',
            lastname: '',
            email: '',
            role: 'USER',
            siteId: undefined,
        },
    });

    useEffect(() => {
        if (open) {
            let firstname = '';
            let lastname = '';

            if (userToEdit?.fullname) {
                const parts = userToEdit.fullname.split(' ');
                firstname = parts[0] || '';
                lastname = parts.slice(1).join(' ') || '';
            }

            const role = userToEdit?.role === 'ADMIN' ? 'SUPER_ADMIN' as const : (userToEdit?.role || 'USER') as 'SUPER_ADMIN' | 'MANAGER' | 'USER' | 'GUEST';

            // Only reset if form is not already being interacted with OR if we are switching users
            const currentValues = form.getValues();
            const shouldReset = !isEdit || currentValues.email !== (userToEdit?.username || '');

            if (shouldReset) {
                form.reset({
                    firstname,
                    lastname,
                    email: userToEdit?.username || '',
                    role,
                    siteId: (userToEdit as any)?.siteId || sites[0]?.id,
                });
            }
        }
    }, [open, userToEdit, form, sites, isEdit]);

    const handleSubmit = (values: UserFormValues) => {
        const fullname = `${values.firstname} ${values.lastname}`.trim();
        const email = values.email.toLowerCase();

        if (isEdit && userToEdit) {
            updateUser.mutate(
                {
                    id: userToEdit.id,
                    dto: {
                        email: email,
                        fullname: fullname,
                        role: values.role
                    }
                },
                {
                    onSuccess: () => {
                        onOpenChange(false);
                    },
                }
            );
        } else {
            const password = generateRandomPassword();
            setGeneratedPassword(password);
            setCreatedUserEmail(email);

            createUser.mutate(
                {
                    username: email,
                    email: email,
                    fullname: fullname,
                    role: values.role,
                    password: password,
                    siteId: values.siteId,
                },
                {
                    onSuccess: () => {
                        onOpenChange(false);
                        setShowPasswordDialog(true);
                    },
                }
            );
        }
    };

    const isLoading = createUser.isPending || updateUser.isPending;
    const showSiteField = !isEdit && sites.length > 0;

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="text-xl">
                            {isEdit ? 'Edit User' : 'Create New User'}
                        </DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? "Update the user's information below."
                                : "Fill in the details to create a new user. A secure password will be generated automatically."}
                        </DialogDescription>
                    </DialogHeader>

                    <Separator />

                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="firstname"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>First Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="John" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="lastname"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Last Name</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Doe" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            <FormField
                                control={form.control}
                                name="email"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Email Address</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                placeholder="john.doe@company.com"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />

                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="role"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Role</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select a role" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {isSuperAdmin && (
                                                        <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                                                    )}
                                                    <SelectItem value="MANAGER">Manager</SelectItem>
                                                    <SelectItem value="USER">Standard User</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                {showSiteField && (
                                    <FormField
                                        control={form.control}
                                        name="siteId"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Site</FormLabel>
                                                <Select
                                                    onValueChange={(val) => field.onChange(parseInt(val, 10))}
                                                    defaultValue={field.value?.toString()}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder="Select a site" />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent>
                                                        {sites.map((site: { id: number; name: string }) => (
                                                            <SelectItem key={site.id} value={site.id.toString()}>
                                                                {site.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                )}
                            </div>

                            <Separator />

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => onOpenChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading
                                        ? 'Saving...'
                                        : (isEdit ? 'Update User' : 'Create User')
                                    }
                                </Button>
                            </DialogFooter>
                        </form>
                    </Form>
                </DialogContent>
            </Dialog>

            {generatedPassword && (
                <NewPasswordDialog
                    open={showPasswordDialog}
                    onOpenChange={setShowPasswordDialog}
                    password={generatedPassword}
                    username={createdUserEmail}
                />
            )}
        </>
    );
}
