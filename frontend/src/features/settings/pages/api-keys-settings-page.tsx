import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
import i18n from '@/lib/i18n';
import { apiKeys, type CreateApiKeyDto } from '@/api/api-keys';
import type { ApiKey } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Copy, AlertTriangle, RefreshCw, Search, Filter, KeyRound } from 'lucide-react';
import { SettingsSection } from '../components/settings-section';
import { format, isAfter } from 'date-fns';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/api/http';

/** Labels live in the locale files under `apiKeys.scopes.<scope with ":" replaced by "_">`. */
const AVAILABLE_SCOPES = [
    'task:read',
    'task:create',
    'task:update',
    'task:delete',
    'schedule:read',
    'schedule:create',
    'user:read',
    'settings:read',
    'api_keys:read',
    'api_keys:write',
];

const scopeKey = (scope: string) => `apiKeys.scopes.${scope.replace(':', '_')}`;

export function ApiKeysSettingsPage() {
    const { t } = useTranslation();
    const dateLocale = getDateLocale();
    const scopeLabel = (scope: string) => t(scopeKey(scope), { defaultValue: scope });
    const [keys, setKeys] = useState<ApiKey[]>([]);
    const [loading, setLoading] = useState(true);
    const [createOpen, setCreateOpen] = useState(false);

    // Create Form State
    const [form, setForm] = useState<CreateApiKeyDto>({
        name: '',
        description: '',
        scopes: ['task:read'],
        expiresAt: '',
    });

    // Filters
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'revoked'>('active');
    const [searchQuery, setSearchQuery] = useState('');

    const [newKey, setNewKey] = useState<string | null>(null);

    const fetchKeys = async () => {
        try {
            const data = await apiKeys.getAll();
            setKeys(data);
        } catch {
            // Called from an effect on mount: the global instance keeps this callback free of component dependencies.
            toast.error(i18n.t('apiKeys.toasts.loadFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // One-shot fetch on mount, not a derived-state sync — safe to keep as an effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchKeys();
    }, []);

    const handleCreate = async () => {
        if (!form.name || form.scopes.length === 0) {
            toast.error(t('apiKeys.toasts.required'));
            return;
        }

        try {
            const res = await apiKeys.create({
                ...form,
                expiresAt: form.expiresAt || undefined
            });
            setNewKey(res.apiKey);
            fetchKeys();
            toast.success(t('apiKeys.toasts.created'));
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, t('apiKeys.toasts.createFailed')));
        }
    };

    const handleRotate = async (id: number) => {
        if (!confirm(t('apiKeys.toasts.rotateConfirm'))) return;
        try {
            const res = await apiKeys.rotate(id);
            setNewKey(res.apiKey);
            setCreateOpen(true); // Re-open dialog to show new key
            fetchKeys();
            toast.success(t('apiKeys.toasts.rotated'));
        } catch (err: unknown) {
            toast.error(getErrorMessage(err, t('apiKeys.toasts.rotateFailed')));
        }
    };

    const handleRevoke = async (id: number) => {
        if (!confirm(t('apiKeys.toasts.revokeConfirm'))) return;
        try {
            await apiKeys.revoke(id);
            toast.success(t('apiKeys.toasts.revoked'));
            fetchKeys();
        } catch {
            toast.error(t('apiKeys.toasts.revokeFailed'));
        }
    };

    const handleCloseCreate = () => {
        setNewKey(null);
        setCreateOpen(false);
        setForm({
            name: '',
            description: '',
            scopes: ['task:read'],
            expiresAt: '',
        });
    };

    const toggleScope = (scope: string) => {
        setForm(prev => ({
            ...prev,
            scopes: prev.scopes.includes(scope)
                ? prev.scopes.filter(s => s !== scope)
                : [...prev.scopes, scope]
        }));
    };

    const copyKey = () => {
        if (newKey) {
            navigator.clipboard.writeText(newKey);
            toast.success(t('apiKeys.toasts.copied'));
        }
    };

    const filteredKeys = useMemo(() => {
        return keys.filter(k => {
            const matchesStatus =
                statusFilter === 'all' ? true :
                    statusFilter === 'active' ? !k.revokedAt && (!k.expiresAt || isAfter(new Date(k.expiresAt), new Date())) :
                        k.revokedAt || (k.expiresAt && !isAfter(new Date(k.expiresAt), new Date()));

            const matchesSearch =
                k.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                k.keyPrefix.toLowerCase().includes(searchQuery.toLowerCase()) ||
                k.description?.toLowerCase().includes(searchQuery.toLowerCase());

            return matchesStatus && matchesSearch;
        });
    }, [keys, statusFilter, searchQuery]);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
    }

    return (
        <SettingsSection
            title={t('apiKeys.orgTitle')}
            description={t('apiKeys.orgDescription')}
            icon={KeyRound}
            action={
                <Dialog open={createOpen} onOpenChange={open => !newKey && (open ? setCreateOpen(true) : handleCloseCreate())}>
                    <DialogTrigger asChild>
                        <Button className="gap-2"><Plus className="h-4 w-4" /> {t('apiKeys.generate')}</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>{newKey ? t('apiKeys.dialogDone') : t('apiKeys.dialogNew')}</DialogTitle>
                            <DialogDescription>
                                {newKey
                                    ? t('apiKeys.descriptionDone')
                                    : t('apiKeys.descriptionNew')}
                            </DialogDescription>
                        </DialogHeader>

                        {!newKey ? (
                            <div className="grid gap-6 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="key-name">{t('apiKeys.name')}</Label>
                                        <Input
                                            id="key-name"
                                            placeholder={t('apiKeys.namePlaceholder')}
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="key-expiry">{t('apiKeys.expiry')}</Label>
                                        <Input
                                            id="key-expiry"
                                            type="date"
                                            value={form.expiresAt}
                                            onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="key-desc">{t('apiKeys.description')}</Label>
                                    <Textarea
                                        id="key-desc"
                                        placeholder={t('apiKeys.descriptionPlaceholder')}
                                        className="h-20"
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label>{t('apiKeys.scopesLabel')}</Label>
                                    <div className="grid grid-cols-2 gap-3 border rounded-lg p-4 bg-muted/30">
                                        {AVAILABLE_SCOPES.map(scope => (
                                            <div key={scope} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`scope-${scope}`}
                                                    checked={form.scopes.includes(scope)}
                                                    onCheckedChange={() => toggleScope(scope)}
                                                />
                                                <Label htmlFor={`scope-${scope}`} className="text-sm font-normal cursor-pointer">
                                                    {scopeLabel(scope)}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="py-6 space-y-6 text-center">
                                <div className="inline-flex items-center justify-center p-3 bg-red-500/10 text-red-500 rounded-full mb-2">
                                    <AlertTriangle className="h-8 w-8" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-lg font-bold">{t('apiKeys.warning')}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {t('apiKeys.copyNow')}
                                    </p>
                                </div>
                                <div className="flex items-center space-x-2 bg-muted p-4 rounded-lg border-2 border-primary/20">
                                    <code className="flex-1 font-mono text-sm break-all font-bold tracking-wider">
                                        {newKey}
                                    </code>
                                    <Button size="icon" variant="secondary" onClick={copyKey}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        )}

                        <DialogFooter>
                            {!newKey ? (
                                <Button onClick={handleCreate} disabled={!form.name || form.scopes.length === 0}>{t('apiKeys.generateKey')}</Button>
                            ) : (
                                <Button onClick={handleCloseCreate} className="w-full">{t('apiKeys.noted')}</Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            }
        >
                <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder={t('apiKeys.search')}
                            className="pl-9"
                            aria-label={t('apiKeys.search')}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={(val: 'all' | 'active' | 'revoked') => setStatusFilter(val)}>
                        <SelectTrigger className="w-full sm:w-[170px]" aria-label={t('apiKeys.status')}>
                            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder={t('apiKeys.status')} />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('apiKeys.statuses.all')}</SelectItem>
                            <SelectItem value="active">{t('apiKeys.statuses.active')}</SelectItem>
                            <SelectItem value="revoked">{t('apiKeys.statuses.revoked')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

            {filteredKeys.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                        <KeyRound className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">{t('apiKeys.empty')}</p>
                </div>
            ) : (
                <ul className="divide-y rounded-xl border">
                    {filteredKeys.map((key) => {
                        const isExpired = key.expiresAt && !isAfter(new Date(key.expiresAt), new Date());
                        const isActive = !key.revokedAt && !isExpired;
                        return (
                            <li key={key.id} className={cn('flex flex-col gap-3 p-4 lg:flex-row lg:items-center', !isActive && 'bg-muted/20 opacity-70')}>
                                <div className="flex min-w-0 flex-1 items-start gap-3">
                                    <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', isActive ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400' : 'bg-muted text-muted-foreground')}>
                                        <KeyRound className="h-4 w-4" />
                                    </span>
                                    <div className="min-w-0 space-y-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-semibold">{key.name || t('apiKeys.unnamed')}</span>
                                            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{key.keyPrefix}…</code>
                                        </div>
                                        {key.description && <p className="line-clamp-1 text-xs text-muted-foreground">{key.description}</p>}
                                        <div className="flex flex-wrap gap-1">
                                            {key.scopes.map(scope => (
                                                <span key={scope} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium">{scopeLabel(scope)}</span>
                                            ))}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                            {t('apiKeys.used', { when: key.lastUsedAt ? format(new Date(key.lastUsedAt), 'PPp', { locale: dateLocale }) : t('apiKeys.never') })}
                                            {' · '}
                                            {t('apiKeys.created', { date: format(new Date(key.createdAt), 'PP', { locale: dateLocale }) })}
                                            {key.expiresAt && !isExpired && <> · {t('apiKeys.expiresOn', { date: format(new Date(key.expiresAt), 'PP', { locale: dateLocale }) })}</>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 lg:shrink-0">
                                    {key.revokedAt ? (
                                        <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">{t('apiKeys.revokedBadge')}</span>
                                    ) : isExpired ? (
                                        <span className="rounded-full bg-orange-500/10 px-2.5 py-0.5 text-xs font-medium text-orange-700 dark:text-orange-400">{t('apiKeys.expiredBadge')}</span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                            {t('apiKeys.activeBadge')}
                                        </span>
                                    )}
                                    {isActive && (
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={t('apiKeys.rotate')} aria-label={t('apiKeys.rotate')} onClick={() => handleRotate(key.id)}>
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                    )}
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                        title={t('apiKeys.revoke')}
                                        aria-label={t('apiKeys.revoke')}
                                        disabled={key.revokedAt !== null}
                                        onClick={() => handleRevoke(key.id)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </SettingsSection>
    );
}
