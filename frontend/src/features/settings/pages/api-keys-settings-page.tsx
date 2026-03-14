import { useEffect, useState, useMemo } from 'react';
import { apiKeys, type CreateApiKeyDto } from '@/api/api-keys';
import type { ApiKey } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, Trash2, Copy, AlertTriangle, RefreshCw, Search, Filter } from 'lucide-react';
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

const AVAILABLE_SCOPES = [
    { value: 'task:read', label: 'Lecture Tâches' },
    { value: 'task:create', label: 'Création Tâches' },
    { value: 'task:update', label: 'Modification Tâches' },
    { value: 'task:delete', label: 'Suppression Tâches' },
    { value: 'schedule:read', label: 'Lecture Plannings' },
    { value: 'schedule:create', label: 'Création Plannings' },
    { value: 'user:read', label: 'Lecture Utilisateurs' },
    { value: 'settings:read', label: 'Lecture Réglages' },
    { value: 'api_keys:read', label: 'Lecture Clés API' },
    { value: 'api_keys:write', label: 'Gestion Clés API' },
];

export function ApiKeysSettingsPage() {
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
            toast.error('Erreur lors du chargement des clés API');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleCreate = async () => {
        if (!form.name || form.scopes.length === 0) {
            toast.error('Veuillez remplir les champs obligatoires');
            return;
        }

        try {
            const res = await apiKeys.create({
                ...form,
                expiresAt: form.expiresAt || undefined
            });
            setNewKey(res.apiKey);
            fetchKeys();
            toast.success('Clé API générée avec succès');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Erreur lors de la création');
        }
    };

    const handleRotate = async (id: number) => {
        if (!confirm('Voulez-vous vraiment régénérer cette clé ? L\'ancienne sera révoquée immédiatement.')) return;
        try {
            const res = await apiKeys.rotate(id);
            setNewKey(res.apiKey);
            setCreateOpen(true); // Re-open dialog to show new key
            fetchKeys();
            toast.success('Clé API régénérée');
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Erreur lors de la rotation');
        }
    };

    const handleRevoke = async (id: number) => {
        if (!confirm('Êtes-vous sûr de vouloir révoquer cette clé ? Elle deviendra inutilisable immédiatement.')) return;
        try {
            await apiKeys.revoke(id);
            toast.success('Clé API révoquée');
            fetchKeys();
        } catch {
            toast.error('Erreur lors de la révocation');
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
            toast.success('Copié dans le presse-papier');
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
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Rechercher une clé..."
                            className="pl-9 w-[250px]"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                    <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
                        <SelectTrigger className="w-[150px]">
                            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                            <SelectValue placeholder="Statut" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Tous les statuts</SelectItem>
                            <SelectItem value="active">Actives</SelectItem>
                            <SelectItem value="revoked">Révoquées / Expireés</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                <Dialog open={createOpen} onOpenChange={open => !newKey && (open ? setCreateOpen(true) : handleCloseCreate())}>
                    <DialogTrigger asChild>
                        <Button className="glow-on-hover"><Plus className="mr-2 h-4 w-4" /> Générer une clé</Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-xl">
                        <DialogHeader>
                            <DialogTitle>{newKey ? 'Clé API générée' : 'Nouvelle clé API'}</DialogTitle>
                            <DialogDescription>
                                {newKey
                                    ? 'Conservez précieusement cette clé, elle ne sera plus affichée ensuite.'
                                    : 'Définissez le nom et les permissions de votre nouvelle clé.'}
                            </DialogDescription>
                        </DialogHeader>

                        {!newKey ? (
                            <div className="grid gap-6 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="key-name">Nom de la clé *</Label>
                                        <Input
                                            id="key-name"
                                            placeholder="ex: Integration Zapier"
                                            value={form.name}
                                            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="key-expiry">Expiration (optionnel)</Label>
                                        <Input
                                            id="key-expiry"
                                            type="date"
                                            value={form.expiresAt}
                                            onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))}
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="key-desc">Description</Label>
                                    <Textarea
                                        id="key-desc"
                                        placeholder="Usage de cette clé..."
                                        className="h-20"
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    />
                                </div>
                                <div className="space-y-3">
                                    <Label>Scopes (Permissions)</Label>
                                    <div className="grid grid-cols-2 gap-3 border rounded-lg p-4 bg-muted/30">
                                        {AVAILABLE_SCOPES.map(scope => (
                                            <div key={scope.value} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`scope-${scope.value}`}
                                                    checked={form.scopes.includes(scope.value)}
                                                    onCheckedChange={() => toggleScope(scope.value)}
                                                />
                                                <Label htmlFor={`scope-${scope.value}`} className="text-sm font-normal cursor-pointer">
                                                    {scope.label}
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
                                    <h3 className="text-lg font-bold">Attention !</h3>
                                    <p className="text-sm text-muted-foreground">
                                        Copiez cette clé maintenant. Pour des raisons de sécurité, nous ne pourrons plus vous la montrer.
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
                                <Button onClick={handleCreate} disabled={!form.name || form.scopes.length === 0}>Générer la clé</Button>
                            ) : (
                                <Button onClick={handleCloseCreate} className="w-full">J'ai bien noté la clé</Button>
                            )}
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            <Card className="glass-morphism overflow-hidden">
                <CardHeader>
                    <CardTitle>Clés API de l'organisation</CardTitle>
                    <CardDescription>
                        Utilisez ces clés pour authentifier les scripts ou services tiers (Header X-API-KEY).
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader className="bg-muted/50">
                            <TableRow>
                                <TableHead className="w-[200px]">Nom / Préfixe</TableHead>
                                <TableHead>Permissions</TableHead>
                                <TableHead>Dernière utilisation</TableHead>
                                <TableHead>Statut</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredKeys.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center h-48 text-muted-foreground italic">
                                        <div className="flex flex-col items-center gap-2">
                                            <AlertTriangle className="h-8 w-8 opacity-20" />
                                            Aucune clé API trouvée.
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredKeys.map((key) => {
                                    const isExpired = key.expiresAt && !isAfter(new Date(key.expiresAt), new Date());
                                    const isActive = !key.revokedAt && !isExpired;

                                    return (
                                        <TableRow key={key.id} className={cn(!isActive && "opacity-60 bg-muted/20")}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-bold text-sm">{key.name || 'Sans nom'}</span>
                                                    <span className="font-mono text-[10px] text-muted-foreground">{key.keyPrefix}...</span>
                                                    {key.description && <span className="text-[11px] text-muted-foreground line-clamp-1">{key.description}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-wrap gap-1 max-w-[250px]">
                                                    {key.scopes.map(scope => {
                                                        const label = AVAILABLE_SCOPES.find(s => s.value === scope)?.label || scope;
                                                        return (
                                                            <Badge key={scope} variant="secondary" className="text-[10px] px-1.5 py-0 whitespace-nowrap">
                                                                {label}
                                                            </Badge>
                                                        );
                                                    })}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col text-[11px]">
                                                    <span className="text-muted-foreground">Utilisée : {key.lastUsedAt ? format(new Date(key.lastUsedAt), 'PPp') : 'Jamais'}</span>
                                                    <span className="text-muted-foreground/70">Créée : {format(new Date(key.createdAt), 'PP')}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {key.revokedAt ? (
                                                    <Badge variant="destructive" className="font-bold">Révoquée</Badge>
                                                ) : isExpired ? (
                                                    <Badge variant="outline" className="text-orange-500 border-orange-500">Expirée</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>
                                                )}
                                                {key.expiresAt && !isExpired && (
                                                    <p className="text-[10px] text-muted-foreground mt-1">Expire le {format(new Date(key.expiresAt), 'PP')}</p>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    {isActive && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            title="Régénérer"
                                                            onClick={() => handleRotate(key.id)}
                                                        >
                                                            <RefreshCw className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:bg-destructive/10"
                                                        title="Révoquer"
                                                        disabled={key.revokedAt !== null}
                                                        onClick={() => handleRevoke(key.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
