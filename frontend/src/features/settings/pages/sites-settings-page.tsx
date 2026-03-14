import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, type Site, type CreateSiteDto } from '@/api/sites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Pencil, Trash2, Building2, Users, ListTodo, Layers } from 'lucide-react';
import { toast } from 'sonner';

export function SitesSettingsPage() {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const [createOpen, setCreateOpen] = useState(false);
    const [editSite, setEditSite] = useState<Site | null>(null);

    const { data: sites = [], isLoading } = useQuery({
        queryKey: ['sites'],
        queryFn: () => sitesApi.findAll(),
    });

    const createMutation = useMutation({
        mutationFn: (dto: CreateSiteDto) => sitesApi.create(dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sites'] });
            setCreateOpen(false);
            toast.success(t('sites.created'));
        },
        onError: () => toast.error(t('sites.createError')),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, dto }: { id: number; dto: Partial<CreateSiteDto> }) =>
            sitesApi.update(id, dto),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sites'] });
            setEditSite(null);
            toast.success(t('sites.updated'));
        },
        onError: () => toast.error(t('sites.updateError')),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: number) => sitesApi.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['sites'] });
            toast.success(t('sites.deleted'));
        },
        onError: () => toast.error(t('sites.deleteError')),
    });

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Building2 className="h-5 w-5" />
                            {t('sites.title')}
                        </CardTitle>
                        <CardDescription>
                            {t('sites.description')}
                        </CardDescription>
                    </div>
                    <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                {t('sites.create')}
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <SiteForm
                                title={t('sites.createTitle')}
                                onSubmit={(dto) => createMutation.mutate(dto)}
                                isLoading={createMutation.isPending}
                            />
                        </DialogContent>
                    </Dialog>
                </div>
            </CardHeader>
            <CardContent>
                {isLoading ? (
                    <div className="text-center py-8 text-muted-foreground">
                        {t('common.loading')}
                    </div>
                ) : sites.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        {t('sites.empty')}
                    </div>
                ) : (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('sites.name')}</TableHead>
                                <TableHead>{t('sites.code')}</TableHead>
                                <TableHead className="text-center">
                                    <Users className="h-4 w-4 inline mr-1" />
                                    {t('sites.users')}
                                </TableHead>
                                <TableHead className="text-center">
                                    <ListTodo className="h-4 w-4 inline mr-1" />
                                    {t('sites.tasks')}
                                </TableHead>
                                <TableHead className="text-center">
                                    <Layers className="h-4 w-4 inline mr-1" />
                                    {t('sites.groups')}
                                </TableHead>
                                <TableHead className="text-right">{t('common.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sites.map((site) => (
                                <TableRow key={site.id}>
                                    <TableCell className="font-medium">
                                        {site.name}
                                        {site.code === 'DEFAULT' && (
                                            <Badge variant="secondary" className="ml-2">
                                                Default
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                                            {site.code}
                                        </code>
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {site._count?.users ?? 0}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {site._count?.tasks ?? 0}
                                    </TableCell>
                                    <TableCell className="text-center">
                                        {site._count?.groups ?? 0}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setEditSite(site)}
                                            >
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            {site.code !== 'DEFAULT' && (
                                                <AlertDialog>
                                                    <AlertDialogTrigger asChild>
                                                        <Button variant="ghost" size="icon">
                                                            <Trash2 className="h-4 w-4 text-destructive" />
                                                        </Button>
                                                    </AlertDialogTrigger>
                                                    <AlertDialogContent>
                                                        <AlertDialogHeader>
                                                            <AlertDialogTitle>
                                                                {t('sites.deleteConfirm')}
                                                            </AlertDialogTitle>
                                                            <AlertDialogDescription>
                                                                {t(
                                                                    'sites.deleteWarning',
                                                                    'This will deactivate the site. Data will be preserved.',
                                                                )}
                                                            </AlertDialogDescription>
                                                        </AlertDialogHeader>
                                                        <AlertDialogFooter>
                                                            <AlertDialogCancel>
                                                                {t('common.cancel')}
                                                            </AlertDialogCancel>
                                                            <AlertDialogAction
                                                                onClick={() => deleteMutation.mutate(site.id)}
                                                            >
                                                                {t('common.delete')}
                                                            </AlertDialogAction>
                                                        </AlertDialogFooter>
                                                    </AlertDialogContent>
                                                </AlertDialog>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                )}
            </CardContent>

            {editSite && (
                <Dialog open onOpenChange={() => setEditSite(null)}>
                    <DialogContent>
                        <SiteForm
                            title={t('sites.editTitle')}
                            initialValues={editSite}
                            onSubmit={(dto) =>
                                updateMutation.mutate({ id: editSite.id, dto })
                            }
                            isLoading={updateMutation.isPending}
                        />
                    </DialogContent>
                </Dialog>
            )}
        </Card>
    );
}

function SiteForm({
    title,
    initialValues,
    onSubmit,
    isLoading,
}: {
    title: string;
    initialValues?: Partial<Site>;
    onSubmit: (dto: CreateSiteDto) => void;
    isLoading: boolean;
}) {
    const { t } = useTranslation();
    const [name, setName] = useState(initialValues?.name ?? '');
    const [code, setCode] = useState(initialValues?.code ?? '');
    const [description, setDescription] = useState(initialValues?.description ?? '');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit({ name, code: code.toUpperCase(), description: description || undefined });
    };

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>{title}</DialogTitle>
                <DialogDescription>
                    {t('sites.formDescription')}
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                    <Label htmlFor="site-name">{t('sites.name')}</Label>
                    <Input
                        id="site-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Site Paris"
                        required
                        minLength={2}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="site-code">{t('sites.code')}</Label>
                    <Input
                        id="site-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value.toUpperCase())}
                        placeholder="PARIS"
                        required
                        minLength={2}
                        maxLength={50}
                        pattern="[A-Z0-9_-]+"
                        disabled={initialValues?.code === 'DEFAULT'}
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="site-description">{t('sites.descriptionLabel')}</Label>
                    <Textarea
                        id="site-description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder={t('sites.descriptionPlaceholder')}
                        rows={3}
                    />
                </div>
            </div>
            <DialogFooter>
                <Button type="submit" disabled={isLoading || !name || !code}>
                    {isLoading
                        ? t('common.saving')
                        : t('common.save')}
                </Button>
            </DialogFooter>
        </form>
    );
}
