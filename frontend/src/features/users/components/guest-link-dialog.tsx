import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
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
import { getDateLocale } from '@/lib/date-locale';

interface GuestLinkDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

const VIEWS: Array<{ value: GuestViewName; icon: typeof Tv }> = [
    { value: 'DASHBOARD', icon: LayoutDashboard },
    { value: 'ANALYTICS', icon: BarChart3 },
];

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
    const { t } = useTranslation();
    const viewLabel = (view: GuestViewName) => t(`userMgmt.guest.views.${view}.label`);
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
            toast.error(t('userMgmt.guest.toasts.linkFailed'));
        }
    };

    const copyLink = async (link: IssuedLink) => {
        try {
            await navigator.clipboard.writeText(link.url);
            toast.success(t('userMgmt.guest.toasts.copied'));
        } catch {
            toast.error(t('userMgmt.guest.toasts.copyFailed'));
        }
    };

    const handleCreate = (siteId: number, siteName: string) => {
        const views = chosenFor(siteId).filter(view => !getGuest(siteId, view));
        if (views.length === 0) return;

        setCreatingForSite(siteId);
        createGuest.mutate({ siteId, views }, {
            onSuccess: async (created) => {
                toast.success(t(created.length > 1 ? 'userMgmt.guest.toasts.createdMany' : 'userMgmt.guest.toasts.createdOne', { site: siteName }));
                setChosen(current => ({ ...current, [siteId]: ['DASHBOARD'] }));
                await Promise.all(created.map(guest => issueLink(guest.id, siteName, viewOf(guest))));
                setCreatingForSite(null);
            },
            onError: () => {
                toast.error(t('userMgmt.guest.toasts.createFailed'));
                setCreatingForSite(null);
            }
        });
    };

    const handleRevoke = (guestId: number) => {
        revokeGuest.mutate(guestId, {
            onSuccess: () => {
                setIssuedLinks(current => current.filter(link => link.key !== guestId));
                toast.success(t('userMgmt.guest.toasts.revoked'));
            },
            onError: () => toast.error(t('userMgmt.guest.toasts.revokeFailed'))
        });
    };

    const handleRegenerate = (guestId: number, siteName: string, view: GuestViewName) => {
        regenerateGuest.mutate(guestId, {
            onSuccess: () => {
                toast.success(t('userMgmt.guest.toasts.resetDone'));
                void issueLink(guestId, siteName, view);
            },
            onError: () => toast.error(t('userMgmt.guest.toasts.resetFailed'))
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
                            <DialogTitle className="text-2xl">{t('userMgmt.guest.title')}</DialogTitle>
                        </div>
                        <DialogDescription>
                            {t('userMgmt.guest.description')}
                        </DialogDescription>
                    </DialogHeader>

                    <Alert className="mt-4 bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
                        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <AlertTitle className="text-blue-800 dark:text-blue-300">{t('userMgmt.guest.policyTitle')}</AlertTitle>
                        <AlertDescription className="text-blue-700/80 dark:text-blue-400/80 text-xs">
                            <Trans i18nKey="userMgmt.guest.policy" components={{ strong: <strong /> }} />
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
                            <p className="font-medium text-muted-foreground">{t('userMgmt.guest.noSite')}</p>
                            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                                {t('userMgmt.guest.noSiteHint')}
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
                                        {VIEWS.map(({ value, icon: Icon }) => {
                                            const guest = getGuest(site.id, value);
                                            const label = viewLabel(value);
                                            const hint = t(`userMgmt.guest.views.${value}.hint`);
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
                                                                {t('userMgmt.guest.active')}
                                                            </Badge>
                                                            <div className="flex gap-2">
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8"
                                                                    aria-label={t('userMgmt.guest.newLinkAria', { view: label, site: site.name })}
                                                                    disabled={createGuestLink.isPending}
                                                                    onClick={() => void issueLink(guest.id, site.name, value)}
                                                                >
                                                                    <Copy className="h-3.5 w-3.5 mr-1" />
                                                                    {t('userMgmt.guest.newLink')}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8"
                                                                    aria-label={t('userMgmt.guest.resetAria', { view: label, site: site.name })}
                                                                    title={t('userMgmt.guest.resetTitle')}
                                                                    onClick={() => handleRegenerate(guest.id, site.name, value)}
                                                                >
                                                                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                                                                    {t('userMgmt.guest.reset')}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    className="h-8 text-destructive hover:text-destructive"
                                                                    aria-label={t('userMgmt.guest.revokeAria', { view: label, site: site.name })}
                                                                    onClick={() => handleRevoke(guest.id)}
                                                                >
                                                                    <Trash className="h-3.5 w-3.5 mr-1" />
                                                                    {t('userMgmt.guest.revoke')}
                                                                </Button>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <Badge variant="secondary" className="opacity-60">
                                                            {t('userMgmt.guest.notCreated')}
                                                        </Badge>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {missing.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-muted/20 border-t">
                                            <span className="text-xs text-muted-foreground">{t('userMgmt.guest.createLabel')}</span>
                                            {missing.map(({ value }) => (
                                                <label key={value} className="flex items-center gap-2 text-sm">
                                                    <Checkbox
                                                        checked={selected.includes(value)}
                                                        onCheckedChange={(checked) => toggleView(site.id, value, checked === true)}
                                                        aria-label={t('userMgmt.guest.createAria', { view: viewLabel(value), site: site.name })}
                                                    />
                                                    {viewLabel(value)}
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
                                                {selected.length > 1 ? t('userMgmt.guest.createMany', { n: selected.length }) : t('userMgmt.guest.createOne')}
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
                            <AlertTitle>{t('userMgmt.guest.oneTimeTitle', { count: issuedLinks.length })}</AlertTitle>
                            <AlertDescription className="space-y-3">
                                {issuedLinks.map(link => (
                                    <div key={link.key} className="space-y-1">
                                        <div className="text-xs font-medium">{link.siteName} · {viewLabel(link.view)}</div>
                                        <div className="flex gap-2">
                                            <Input
                                                readOnly
                                                value={link.url}
                                                className="font-mono text-xs"
                                                aria-label={t('userMgmt.guest.oneTimeAria', { site: link.siteName, view: viewLabel(link.view) })}
                                                onFocus={(e) => e.currentTarget.select()}
                                            />
                                            <Button type="button" size="sm" onClick={() => void copyLink(link)}>
                                                <Copy className="h-3.5 w-3.5 mr-1" />
                                                {t('userMgmt.guest.copy')}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                                <p className="text-xs">
                                    <Trans
                                        i18nKey="userMgmt.guest.oneTimeHelp"
                                        values={{ date: new Date(issuedLinks[0].expiresAt).toLocaleString(getDateLocale().code) }}
                                        components={{ strong: <strong /> }}
                                    />
                                </p>
                            </AlertDescription>
                        </Alert>
                    </div>
                )}

                <div className="p-6 bg-muted/30 border-t flex justify-between items-center">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {t('userMgmt.guest.footer')}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
                        {t('common.close')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
