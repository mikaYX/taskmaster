import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Tv,
    Copy,
    Trash,
    Loader2,
    ShieldAlert,
    Info,
    RotateCcw,
    LayoutDashboard,
    BarChart3,
} from 'lucide-react';
import { useSites } from '@/hooks/use-sites';
import {
    useGuests,
    useCreateGuest,
    useCreateGuestLink,
    useRevokeGuest,
    useRegenerateGuestPassword,
} from '@/hooks/use-users';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Alert,
    AlertDescription,
    AlertTitle
} from '@/components/ui/alert';
import type { GuestViewName, User } from '@/api/types';

interface GuestLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const VIEWS: Array<{ value: GuestViewName; label: string; hint: string; icon: typeof Tv }> = [
    { value: 'DASHBOARD', label: 'Dashboard', hint: 'In-progress tasks of the site', icon: LayoutDashboard },
    { value: 'ANALYTICS', label: 'Analytics', hint: 'Compliance figures of the site', icon: BarChart3 },
];

const viewLabel = (view: GuestViewName) => VIEWS.find(v => v.value === view)?.label ?? view;

/** An account created before views existed has none and shows the board. */
const viewOf = (guest: Pick<User, 'guestView'>): GuestViewName => guest.guestView ?? 'DASHBOARD';

interface IssuedLink {
    key: number;
    siteName: string;
    view: GuestViewName;
    url: string;
    expiresAt: string;
}

export function GuestLinkDialog({ open, onOpenChange }: GuestLinkDialogProps) {
    const { data: sites, isLoading: isLoadingSites } = useSites();
    const { data: guests, isLoading: isLoadingGuests } = useGuests();

    const createGuest = useCreateGuest();
    const createGuestLink = useCreateGuestLink();
    const revokeGuest = useRevokeGuest();
    const regenerateGuest = useRegenerateGuestPassword();

    const [creatingForSite, setCreatingForSite] = useState<number | null>(null);
    // Which of the missing links to create, per site. The board by default.
    const [chosen, setChosen] = useState<Record<number, GuestViewName[]>>({});
    // The one-time links just issued, shown until the dialog is closed.
    const [issuedLinks, setIssuedLinks] = useState<IssuedLink[]>([]);

    const getGuest = (siteId: number, view: GuestViewName) =>
        guests?.find(g => viewOf(g) === view && g.sites?.some(s => s.siteId === siteId));

    const chosenFor = (siteId: number): GuestViewName[] => chosen[siteId] ?? ['DASHBOARD'];

    const toggleView = (siteId: number, view: GuestViewName, checked: boolean) =>
        setChosen(current => {
            const now = current[siteId] ?? ['DASHBOARD'];
            return { ...current, [siteId]: checked ? [...new Set([...now, view])] : now.filter(v => v !== view) };
        });

    /** Never carries a password: the ticket is valid once and swapped for a session. */
    const buildTvUrl = (ticket: string) => {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        return `${origin}/login?guest_ticket=${ticket}`;
    };

    const issueLink = async (guestId: number, siteName: string, view: GuestViewName) => {
        try {
            const data = await createGuestLink.mutateAsync(guestId);
            setIssuedLinks(current => [
                ...current.filter(link => link.key !== guestId),
                { key: guestId, siteName, view, url: buildTvUrl(data.ticket), expiresAt: data.expiresAt },
            ]);
        } catch {
            toast.error("Failed to generate the link");
        }
    };

    const copyLink = async (link: IssuedLink) => {
        try {
            await navigator.clipboard.writeText(link.url);
            toast.success("Link copied");
        } catch {
            toast.error("Copy failed: select the link and copy it manually");
        }
    };

    const handleCreate = (siteId: number, siteName: string) => {
        const views = chosenFor(siteId).filter(view => !getGuest(siteId, view));
        if (views.length === 0) return;

        setCreatingForSite(siteId);
        createGuest.mutate({ siteId, views }, {
            onSuccess: async (created) => {
                toast.success(created.length > 1 ? `Guest links created for ${siteName}` : `Guest link created for ${siteName}`);
                setChosen(current => ({ ...current, [siteId]: ['DASHBOARD'] }));
                await Promise.all(created.map(guest => issueLink(guest.id, siteName, viewOf(guest))));
                setCreatingForSite(null);
            },
            onError: () => {
                toast.error("Failed to create the guest link");
                setCreatingForSite(null);
            }
        });
    };

    const handleRevoke = (guestId: number) => {
        revokeGuest.mutate(guestId, {
            onSuccess: () => {
                setIssuedLinks(current => current.filter(link => link.key !== guestId));
                toast.success("Guest link revoked");
            },
            onError: () => toast.error("Failed to revoke guest link")
        });
    };

    const handleRegenerate = (guestId: number, siteName: string, view: GuestViewName) => {
        regenerateGuest.mutate(guestId, {
            onSuccess: () => {
                toast.success("Screen signed out and access reset");
                void issueLink(guestId, siteName, view);
            },
            onError: () => toast.error("Failed to reset the access")
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
                            Generate secure, read-only links for TV screens. Each site can have a link for the
                            dashboard and a link for the analytics.
                        </DialogDescription>
                    </DialogHeader>

                    <Alert className="mt-4 bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertTitle className="text-blue-800 dark:text-blue-300">TV Mode Security Policy</AlertTitle>
                        <AlertDescription className="text-blue-700/80 dark:text-blue-400/80 text-xs">
                            Guests are <strong>read-only</strong> and see the figures of <strong>their site</strong> only.
                            The <strong>dashboard</strong> link shows in-progress tasks; the <strong>analytics</strong> link
                            shows compliance figures, with no per-person data and no exports.
                            A link opens only its own screen.
                        </AlertDescription>
                    </Alert>
                </div>

                <div className="flex-1 overflow-auto p-6 pt-2 space-y-4">
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
                        sites.map((site) => {
                            const missing = VIEWS.filter(view => !getGuest(site.id, view.value));
                            const selected = chosenFor(site.id).filter(view => missing.some(m => m.value === view));
                            const isCreating = creatingForSite === site.id;

                            return (
                                <div key={site.id} className="border rounded-md overflow-hidden">
                                    <div className="px-4 py-3 bg-muted/50 border-b">
                                        <span className="font-medium">{site.name}</span>
                                        <span className="ml-2 text-xs text-muted-foreground font-mono">{site.code}</span>
                                    </div>

                                    <div className="divide-y">
                                        {VIEWS.map(({ value, label, hint, icon: Icon }) => {
                                            const guest = getGuest(site.id, value);
                                            return (
                                                <div key={value} className="flex items-center gap-3 px-4 py-3">
                                                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-sm font-medium">{label}</div>
                                                        <div className="text-xs text-muted-foreground truncate">
                                                            {guest ? <span className="font-mono">{guest.username}</span> : hint}
                                                        </div>
                                                    </div>
                                                    {guest ? (
                                                        <>
                                                            <Badge variant="default" className="bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-200 dark:border-green-900/50">
                                                                Active
                                                            </Badge>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8"
                                                                    aria-label={`New ${label} link for ${site.name}`}
                                                                    disabled={createGuestLink.isPending}
                                                                    onClick={() => void issueLink(guest.id, site.name, value)}
                                                                >
                                                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                                                    New link
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8"
                                                                    aria-label={`Reset ${label} access for ${site.name}`}
                                                                    title="Sign the screen out and generate a fresh link"
                                                                    onClick={() => handleRegenerate(guest.id, site.name, value)}
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                                                    Reset
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 text-destructive hover:text-destructive"
                                                                    aria-label={`Revoke ${label} link for ${site.name}`}
                                                                    onClick={() => handleRevoke(guest.id)}
                                                                >
                                                                    <Trash className="h-3.5 w-3.5 mr-1" />
                                                                    Revoke
                                                                </Button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Badge variant="secondary" className="opacity-60">
                                                            Not created
                                                        </Badge>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {missing.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-muted/20 border-t">
                                            <span className="text-xs text-muted-foreground">Create:</span>
                                            {missing.map(({ value, label }) => (
                                                <label key={value} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={selected.includes(value)}
                                                        onCheckedChange={(checked) => toggleView(site.id, value, checked === true)}
                                                        aria-label={`${label} link for ${site.name}`}
                                                    />
                                                    {label}
                                                </label>
                                            ))}
                                            <Button
                                                size="sm"
                                                className="h-8 ml-auto"
                                                disabled={isCreating || selected.length === 0}
                                                onClick={() => handleCreate(site.id, site.name)}
                                            >
                                                {isCreating ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Tv className="h-3.5 w-3.5 mr-1" />
                                                )}
                                                {selected.length > 1 ? `Create ${selected.length} links` : 'Create link'}
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {issuedLinks.length > 0 && (
                    <div className="px-6 pb-4 space-y-3">
                        <Alert>
                            <Info className="h-4 w-4" />
                            <AlertTitle>One-time {issuedLinks.length > 1 ? 'links' : 'link'}</AlertTitle>
                            <AlertDescription className="space-y-3">
                                {issuedLinks.map(link => (
                                    <div key={link.key} className="space-y-1">
                                        <div className="text-xs font-medium">{link.siteName} · {viewLabel(link.view)}</div>
                                        <div className="flex gap-2">
                                            <Input
                                                readOnly
                                                value={link.url}
                                                className="font-mono text-xs"
                                                aria-label={`One-time TV link, ${link.siteName} ${viewLabel(link.view)}`}
                                                onFocus={(e) => e.currentTarget.select()}
                                            />
                                            <Button type="button" size="sm" onClick={() => void copyLink(link)}>
                                                <Copy className="h-3.5 w-3.5 mr-1" />
                                                Copy
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <p className="text-xs">
                                    Open each link <strong>once</strong> on its TV screen (or in a private window): it signs
                                    the screen in for as long as it stays connected, with no password in the address.
                                    Valid until {new Date(issuedLinks[0].expiresAt).toLocaleString()}; a new link cancels the previous one.
                                </p>
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <div className="p-6 bg-muted/30 border-t flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        One link per screen and per site.
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
