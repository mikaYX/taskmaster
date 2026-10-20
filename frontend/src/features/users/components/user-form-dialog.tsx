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
import { Checkbox } from '@/components/ui/checkbox';
import type { CredentialsEmailStatus, User } from '@/api/types';
import { sitesApi } from '@/api/sites';
import { getErrorMessage } from '@/api/http';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useCreateUser, useCredentialsEmailAvailable, useUpdateUser } from '@/hooks/use-users';
import { useIsSuperAdmin } from '@/stores/auth-store';
import { NewPasswordDialog } from './new-password-dialog';
import { generateTemporaryPassword } from '@/lib/password-policy';

const userSchema = z.object({
    // Translation keys: FormMessage translates them when displayed.
    firstname: z.string().min(1, 'userMgmt.validation.firstNameRequired'),
    lastname: z.string().min(1, 'userMgmt.validation.lastNameRequired'),
    email: z.string().email('userMgmt.validation.invalidEmail'),
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
    const { t } = useTranslation();
    const createUser = useCreateUser();
    const updateUser = useUpdateUser();
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [showPasswordDialog, setShowPasswordDialog] = useState(false);
    const [createdUserEmail, setCreatedUserEmail] = useState('');
    const [sendEmail, setSendEmail] = useState(true);
    const [emailStatus, setEmailStatus] = useState<CredentialsEmailStatus | undefined>();
    const isSuperAdmin = useIsSuperAdmin();

    const isEdit = !!userToEdit;

    const emailAvailability = useCredentialsEmailAvailable(open && !isEdit);
    const emailAvailable = emailAvailability.data?.available === true;
    // Known only once the check answered; an unreachable check is treated as not active.
    const emailCheckDone = emailAvailability.isSuccess || emailAvailability.isError;

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
                    siteId: userToEdit?.siteId || sites[0]?.id,
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
            const password = generateTemporaryPassword();
            const requestEmail = emailAvailable && sendEmail;
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
                    sendEmail: requestEmail || undefined,
                },
                {
                    onError: (error) => {
                        setGeneratedPassword(null);
                        toast.error(getErrorMessage(error, t('userMgmt.form.createFailed')));
                    },
                    onSuccess: (created) => {
                        // Email unavailable: tell the admin to hand the password over directly.
                        setEmailStatus(requestEmail ? created.credentialsEmail : (emailAvailable ? undefined : 'NOT_ACTIVE'));
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
                            {isEdit ? t('users.editUser') : t('userMgmt.form.createTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {isEdit
                                ? t('userMgmt.form.editDescription')
                                : t('userMgmt.form.createDescription')}
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
                                            <FormLabel>{t('userMgmt.form.firstName')}</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t('userMgmt.form.firstNamePlaceholder')} {...field} />
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
                                            <FormLabel>{t('userMgmt.form.lastName')}</FormLabel>
                                            <FormControl>
                                                <Input placeholder={t('userMgmt.form.lastNamePlaceholder')} {...field} />
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
                                        <FormLabel>{t('userMgmt.form.email')}</FormLabel>
                                        <FormControl>
                                            <Input
                                                type="email"
                                                placeholder={t('userMgmt.form.emailPlaceholder')}
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
                                            <FormLabel>{t('userMgmt.form.role')}</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={t('userMgmt.form.selectRole')} />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    {isSuperAdmin && (
                                                        <SelectItem value="SUPER_ADMIN">{t('userMgmt.form.roles.superAdmin')}</SelectItem>
                                                    )}
                                                    <SelectItem value="MANAGER">{t('userMgmt.form.roles.manager')}</SelectItem>
                                                    <SelectItem value="USER">{t('userMgmt.form.roles.user')}</SelectItem>
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
                                                <FormLabel>{t('userMgmt.form.site')}</FormLabel>
                                                <Select
                                                    onValueChange={(val) => field.onChange(parseInt(val, 10))}
                                                    defaultValue={field.value?.toString()}
                                                >
                                                    <FormControl>
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={t('userMgmt.form.selectSite')} />
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

                            {!isEdit && emailCheckDone && (
                                emailAvailable ? (
                                    <label className="flex items-start gap-3 text-sm">
                                        <Checkbox
                                            checked={sendEmail}
                                            onCheckedChange={(checked) => setSendEmail(checked === true)}
                                            className="mt-0.5"
                                        />
                                        <span>
                                            {t('userMgmt.form.sendEmail')}
                                            <span className="block text-muted-foreground">
                                                {t('userMgmt.form.sendEmailHint')}
                                            </span>
                                        </span>
                                    </label>
                                ) : (
                                    <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                                        {t('userMgmt.form.emailInactive')}
                                    </p>
                                )
                            )}

                            <Separator />

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => onOpenChange(false)}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button type="submit" disabled={isLoading}>
                                    {isLoading
                                        ? t('common.saving')
                                        : (isEdit ? t('userMgmt.form.update') : t('userMgmt.form.create'))
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
                    emailStatus={emailStatus}
                />
            )}
        </>
    );
}
