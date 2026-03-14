import { useEffect } from 'react';
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
    name: z.string().min(3, 'Group name must be at least 3 characters'),
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
                        {isEdit ? 'Edit Group' : 'Create New Group'}
                    </DialogTitle>
                    <DialogDescription>
                        {isEdit
                            ? "Update the group's information below."
                            : "Create a new group to organize users and simplify task assignments."}
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
                                    <FormLabel>Group Name</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Engineering Team" {...field} />
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
                                        <FormLabel>Site</FormLabel>
                                        <Select
                                            onValueChange={(val) => field.onChange(parseInt(val, 10))}
                                            value={field.value ? String(field.value) : ''}
                                        >
                                            <FormControl>
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Select a site" />
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
                                    <FormLabel>Description</FormLabel>
                                    <FormControl>
                                        <Textarea
                                            placeholder="Optional description of the group's purpose..."
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
                                Cancel
                            </Button>
                            <Button type="submit" disabled={isLoading}>
                                {isLoading
                                    ? 'Saving...'
                                    : (isEdit ? 'Update Group' : 'Create Group')
                                }
                            </Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
