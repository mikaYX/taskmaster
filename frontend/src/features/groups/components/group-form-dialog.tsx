import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import type { Group } from '@/api/types';
import { useCreateGroup, useUpdateGroup } from '@/hooks/use-groups';
import { useSites } from '@/hooks/use-sites';
import { useAuthStore } from '@/stores/auth-store';
import { useSiteStore } from '@/stores/site-store';

const groupSchema = z.object({
    name: z.string().min(3, 'groupMgmt.validation.nameMin3'),
    description: z.string().optional(),
    siteId: z.number().optional(),
});

type GroupFormValues = z.infer<typeof groupSchema>;

interface GroupFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groupToEdit?: Group;
}

export function GroupFormDialog({ open, onOpenChange, groupToEdit }: GroupFormDialogProps) {
    const { t } = useTranslation();
    const createGroup = useCreateGroup();
    const updateGroup = useUpdateGroup();
    const { data: sites = [] } = useSites();
    const role = useAuthStore((s) => s.role);
    const userSites = useAuthStore((s) => s.sites || []);
    const currentSiteId = useSiteStore((s) => s.currentSiteId);

    const isEdit = !!groupToEdit;
    const isSuperAdmin = role === 'SUPER_ADMIN';

    const availableSites = isSuperAdmin
        ? sites
        : sites.filter((site) => userSites.some((us) => us.siteId === site.id));

    const form = useForm<GroupFormValues>({
        resolver: zodResolver(groupSchema),
        defaultValues: {
            name: '',
            description: '',
            siteId: undefined,
        },
    });

    useEffect(() => {
        if (open) {
            if (groupToEdit) {
                form.reset({
                    name: groupToEdit.name,
                    description: groupToEdit.description || '',
                    siteId: groupToEdit.siteId,
                });
            } else {
                form.reset({
                    name: '',
                    description: '',
                    siteId: currentSiteId || availableSites[0]?.id,
                });
            }
        }
    }, [open, groupToEdit, form, currentSiteId, availableSites]);

    const handleSubmit = (values: GroupFormValues) => {
        if (isEdit && groupToEdit) {
            updateGroup.mutate(
                { id: groupToEdit.id, dto: values },
                { onSuccess: () => onOpenChange(false) },
            );
        } else {
            createGroup.mutate(
                values,
                { onSuccess: () => onOpenChange(false) },
            );
        }
    };

    const isLoading = createGroup.isPending || updateGroup.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle className="text-xl">
                        {isEdit ? t('groups.editGroup') : t('groupMgmt.form.createTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? t('groupMgmt.form.editDescription')
                            : t('groupMgmt.form.createDescription')}
                    </DialogDescription>
                </DialogHeader>

                <Separator />

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('groupMgmt.form.name')}</FormLabel>
                                    <FormControl>
                                        <Input placeholder={t('groupMgmt.form.namePlaceholder')} {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        {availableSites.length > 0 && (
                            <FormField
                                control={form.control}
                                name="siteId"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>{t('groupMgmt.form.site')}</FormLabel>
                                        <Select
                                            onValueChange={(val) => field.onChange(parseInt(val, 10))}
                                            value={field.value ? String(field.value) : ''}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder={t('groupMgmt.form.selectSite')} />
                                                </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                                {availableSites.map((site) => (
                                                    <SelectItem key={site.id} value={String(site.id)}>
                                                        <div className="flex items-center gap-2">
                                                            <span>{site.name}</span>
                                                            <Badge variant="outline" className="text-xs">
                                                                {site.code}
                                                            </Badge>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        )}

                        <FormField
                            control={form.control}
                            name="description"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t('groupMgmt.form.description')}</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder={t('groupMgmt.form.descriptionPlaceholder')}
                                            className="resize-none min-h-[100px]"
                                            {...field}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

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
                                    : (isEdit ? t('groupMgmt.form.update') : t('groupMgmt.form.create'))
                                }
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
