import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Tv,
    Copy,
    Trash,
    Loader2,
    ShieldAlert,
    Info,
    RotateCcw
} from 'lucide-react';
import { useSites } from '@/hooks/use-sites';
import { useGuests, useCreateGuest, useRevokeGuest, useRegenerateGuestPassword } from '@/hooks/use-users';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Alert,
    AlertDescription,
    AlertTitle
} from '@/components/ui/alert';

interface GuestLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function GuestLinkDialog({ open, onOpenChange }: GuestLinkDialogProps) {
    const { data: sites, isLoading: isLoadingSites } = useSites();
    const { data: guests, isLoading: isLoadingGuests } = useGuests();

    const createGuest = useCreateGuest();
    const revokeGuest = useRevokeGuest();
    const regenerateGuest = useRegenerateGuestPassword();

    const [generatingForSite, setGeneratingForSite] = useState<number | null>(null);

    const getGuestForSite = (siteId: number) => {
        // Find guest assigned to this site
        return guests?.find(g => g.sites?.some(s => s.siteId === siteId));
    };

    const handleCreateGuest = async (siteId: number, siteName: string) => {
        setGeneratingForSite(siteId);
        createGuest.mutate(siteId, {
            onSuccess: (data) => {
                toast.success(`Guest link created for ${siteName}`);
                // In the new backend flow, we return rawPassword once
                if (data.rawPassword) {
                    const loginLink = getLoginUrl(data.username, data.rawPassword);
                    navigator.clipboard.writeText(loginLink);
                    toast.info("Lien complet copié dans le presse-papier", {
                        description: "Conservez ce lien en lieu sûr, il contient les identifiants."
                    });
                }
                setGeneratingForSite(null);
            },
            onError: () => {
                toast.error("Failed to create guest link");
                setGeneratingForSite(null);
            }
        });
    };

    const handleRevoke = (guestId: number) => {
        revokeGuest.mutate(guestId, {
            onSuccess: () => toast.success("Guest link revoked"),
            onError: () => toast.error("Failed to revoke guest link")
        });
    };

    const getLoginUrl = (username: string, password?: string) => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        const params = new URLSearchParams({ u: username });
        if (password) params.set('p', password);
        return `${origin}/login?${params.toString()}`;
    };

    const handleRegenerate = (guest: { id: number; username: string }) => {
        regenerateGuest.mutate(guest.id, {
            onSuccess: (data) => {
                toast.success("Password regenerated");
                const fullLink = getLoginUrl(guest.username, data.newPassword);
                navigator.clipboard.writeText(fullLink);
                toast.info("Lien complet copié dans le presse-papier", {
                    description: "Conservez ce lien en lieu sûr, il contient le mot de passe."
                });
            },
            onError: () => toast.error("Failed to regenerate password")
        });
    };

    const isLoading = isLoadingSites || isLoadingGuests;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[750px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <div className="p-6 pb-2">
                    <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <Tv className="h-6 w-6" />
                            </div>
                            <DialogTitle className="text-2xl">Guest TV Links</DialogTitle>
                        </div>
                        <DialogDescription>
                            Generate secure, read-only links for TV dashboards. Access is restricted to in-progress tasks of the assigned site.
                        </DialogDescription>
                    </DialogHeader>

                    <Alert className="mt-4 bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertTitle className="text-blue-800 dark:text-blue-300">TV Mode Security Policy</AlertTitle>
                        <AlertDescription className="text-blue-700/80 dark:text-blue-400/80 text-xs">
                            Guests are <strong>Read-only</strong>. They only see <strong>In-progress</strong> tasks
                            for their assigned <strong>Site</strong>. Classic creation is blocked for this role.
                        </AlertDescription>
                    </Alert>
                </div>

                <div className="flex-1 overflow-auto p-6 pt-2">
                    {isLoading ? (
                        <div className="space-y-4 py-4">
                            {[1, 2, 3].map(i => (
                                <Skeleton key={i} className="h-16 w-full" />
                            ))}
                        </div>
                    ) : !sites?.length ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center border rounded-md bg-muted/20">
                            <Tv className="h-12 w-12 text-muted-foreground/50 mb-3" />
                            <p className="font-medium text-muted-foreground">Aucun site configuré</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                Créez d’abord un site (Paramètres → Sites) pour pouvoir générer un lien invité TV par site.
                            </p>
                        </div>
                    ) : (
                        <div className="border rounded-md">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow>
                                        <TableHead>Site</TableHead>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sites.map((site) => {
                                        const guest = getGuestForSite(site.id);
                                        const isCreating = generatingForSite === site.id;

                                        return (
                                            <TableRow key={site.id}>
                                                <TableCell className="font-medium">
                                                    {site.name}
                                                    <div className="text-xs text-muted-foreground font-normal">
                                                        {site.code}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-xs">
                                                    {guest ? guest.username : '-'}
                                                </TableCell>
                                                <TableCell>
                                                    {guest ? (
                                                        <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200 dark:border-green-900/50">
                                                            Active
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="secondary" className="opacity-50">
                                                            Inactive
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {guest ? (
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8"
                                                                onClick={() => {
                                                                    const link = getLoginUrl(guest.username);
                                                                    navigator.clipboard.writeText(link);
                                                                    toast.success("Lien de connexion copié (sans mot de passe)");
                                                                }}
                                                            >
                                                                <Copy className="h-3.5 w-3.5 mr-1" />
                                                                Lien
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8"
                                                                onClick={() => handleRegenerate(guest)}
                                                            >
                                                                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                                                Pass
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="h-8 text-destructive hover:text-destructive"
                                                                onClick={() => handleRevoke(guest.id)}
                                                            >
                                                                <Trash className="h-3.5 w-3.5 mr-1" />
                                                                Revoke
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button
                                                            size="sm"
                                                            className="h-8"
                                                            disabled={isCreating}
                                                            onClick={() => handleCreateGuest(site.id, site.name)}
                                                        >
                                                            {isCreating ? (
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Tv className="h-3.5 w-3.5 mr-1" />
                                                            )}
                                                            Create Link
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </div>

                <div className="p-6 bg-muted/30 border-t flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        One guest per site maximum.
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
