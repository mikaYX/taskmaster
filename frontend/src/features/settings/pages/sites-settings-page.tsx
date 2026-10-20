import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { sitesApi, type Site, type CreateSiteDto } from '@/api/sites';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { Plus, Pencil, Trash2, Building2, Users, ListTodo, Layers, MapPin } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsSection } from '../components/settings-section';
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
        <SettingsSection
            title={t('sites.title')}
            description={t('sites.description')}
            icon={Building2}
            action={
                <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                    <DialogTrigger asChild>
                        <Button className="gap-2">
                            <Plus className="h-4 w-4" />
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
            }
        >
            {isLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                    <Skeleton className="h-32 rounded-xl" />
                    <Skeleton className="h-32 rounded-xl" />
                </div>
            ) : sites.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <MapPin className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('sites.empty')}</p>
                </div>
            ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                    {sites.map((site) => {
                        const isDefault = site.code === 'DEFAULT';
                        const stats = [
                            { icon: Users, value: site._count?.users ?? 0, label: t('sites.users') },
                            { icon: ListTodo, value: site._count?.tasks ?? 0, label: t('sites.tasks') },
                            { icon: Layers, value: site._count?.groups ?? 0, label: t('sites.groups') },
                        ];
                        return (
                            <li key={site.id} className="group flex flex-col gap-4 rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
                                <div className="flex items-start gap-3">
                                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 dark:text-teal-400">
                                        <MapPin className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="truncate font-semibold">{site.name}</p>
                                            {isDefault && (
                                                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">{t('sites.defaultBadge')}</span>
                                            )}
                                        </div>
                                        <code className="text-xs text-muted-foreground">{site.code}</code>
                                    </div>
                                    <div className="flex gap-1">
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                                            aria-label={t('sites.editTitle')}
                                            title={t('sites.editTitle')}
                                            onClick={() => setEditSite(site)}
                                        >
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        {!isDefault && (
                                            <AlertDialog>
                                                <AlertDialogTrigger asChild>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                        aria-label={t('sites.deleteConfirm')}
                                                        title={t('sites.deleteConfirm')}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
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
                                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                            onClick={() => deleteMutation.mutate(site.id)}
                                                        >
                                                            {t('common.delete')}
                                                        </AlertDialogAction>
                                                    </AlertDialogFooter>
                                                </AlertDialogContent>
                                            </AlertDialog>
                                        )}
                                    </div>
                                </div>
                                {site.description && <p className="line-clamp-2 text-sm text-muted-foreground">{site.description}</p>}
                                <div className="grid grid-cols-3 gap-2 border-t pt-3">
                                    {stats.map(({ icon: Icon, value, label }) => (
                                        <div key={label} className="rounded-lg bg-muted/40 px-3 py-2">
                                            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                                <Icon className="h-3 w-3" />
                                                {label}
                                            </p>
                                            <p className="text-lg font-semibold tabular-nums">{value}</p>
                                        </div>
                                    ))}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

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
        </SettingsSection>
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
