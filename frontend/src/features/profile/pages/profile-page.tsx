import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
import { userKeys } from '@/hooks/use-users';
import { getErrorMessage } from '@/api/http';
import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores';
import { useOwnProfile, useUploadMyAvatar } from '@/hooks/use-users';
import { resolveAvatarSrc } from '@/lib/avatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Shield, Key as KeyIcon, Camera, Mail, Save, ShieldCheck, Smartphone, User } from 'lucide-react';
import { toast } from 'sonner';
import { ChangePasswordDialog } from '../components/change-password-dialog';
import { MfaSetupDialog } from '../components/mfa-setup-dialog';
import { PasskeysManageDialog } from '../components/passkeys-manage-dialog';

export function ProfilePage() {
    const scope = useAuthStore(state => `${state.userId}:${state.role}`);
    return <ProfileWorkspace key={scope} />;
}

function ProfileWorkspace() {
    const { t } = useTranslation();
    const client = useQueryClient();
    const { userId, passkeysEnabled, passkeyPolicy, hasPasskey, role: currentRole } = useAuthStore(
        useShallow((state) => ({
            userId: state.userId,
            passkeysEnabled: state.passkeysEnabled,
            passkeyPolicy: state.passkeyPolicy,
            hasPasskey: state.hasPasskey,
            role: state.role,
        })),
    );
    const isGuest = currentRole === 'GUEST';
    const profileKey = ['own-profile', userId, currentRole];
    const profile = useOwnProfile();
    const [fullname, setFullname] = useState<string | null>(null);
    const saveProfile = useMutation({
        mutationFn: usersApi.updateOwnProfile,
        onSuccess: data => {
            client.setQueryData(profileKey, data);
            client.invalidateQueries({ queryKey: userKeys.lists() });
            setFullname(null);
            toast.success(t('profileSettings.saved'));
        },
        onError: error => toast.error(getErrorMessage(error, t('profileSettings.saveFailed'))),
    });
    const uploadAvatar = useUploadMyAvatar();
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [isMfaDialogOpen, setIsMfaDialogOpen] = useState(false);
    const [isPasskeysDialogOpen, setIsPasskeysDialogOpen] = useState(false);
    const [localAvatarSrc, setLocalAvatarSrc] = useState<string | undefined>(undefined);

    const currentUser = profile.data;
    const remoteAvatarSrc = resolveAvatarSrc(currentUser?.avatarUrl);
    const avatarSrc = localAvatarSrc ?? remoteAvatarSrc;
    const displayName = currentUser?.fullname || currentUser?.username || t('profilePage.defaultName');
    const email = currentUser?.email || '';
    const role = currentUser?.role || currentRole || 'USER';
    const initials = displayName.substring(0, 2).toUpperCase();

    // Get security settings from admin configuration
    const mfaEnabled = true; // Always available if methods are configured, fallback to enforcing checks
    const mfaEnforced = currentUser?.mfaRequired ?? false;

    // Passkey enforcement dynamically from backend session
    const passkeysEnforced = passkeyPolicy === 'required';
    const userHasPasskeys = hasPasskey;

    const userHasMfa = currentUser?.mfaEnabled ?? false;

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast.error(t('profilePage.avatar.unsupportedFormat'));
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setLocalAvatarSrc(objectUrl);
        try {
            const result = await uploadAvatar.mutateAsync(file);
            setLocalAvatarSrc(resolveAvatarSrc(result.url));
            toast.success(t('profilePage.avatar.updated'));
        } catch {
            setLocalAvatarSrc(undefined);
            toast.error(t('profilePage.avatar.failed'));
        }
        URL.revokeObjectURL(objectUrl);
        e.target.value = '';
    };

    if (profile.isLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (profile.isError) return <div role="alert" className="space-y-3 p-6">
        <p>{t('profileSettings.loadFailed')}</p>
        <Button onClick={() => profile.refetch()}>{t('common.tryAgain')}</Button>
    </div>;

    const protections = [true, userHasMfa, userHasPasskeys].filter(Boolean).length;
    const statusPill = (state: 'on' | 'off' | 'required' | 'unavailable') => {
        const tone = {
            on: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
            off: 'bg-muted text-muted-foreground',
            required: 'bg-red-500/10 text-red-700 dark:text-red-400',
            unavailable: 'bg-muted text-muted-foreground',
        }[state];
        return (
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${state === 'on' ? 'bg-emerald-500' : state === 'required' ? 'bg-red-500' : 'bg-muted-foreground/60'}`} />
                {t(`profilePage.status.${state}`)}
            </span>
        );
    };

    const securityRow = (
        icon: typeof Lock,
        tone: string,
        title: string,
        description: string,
        pill: React.ReactNode,
        action: React.ReactNode,
        note?: string,
    ) => {
        const Icon = icon;
        return (
            <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
                    <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{title}</h3>
                        {pill}
                    </div>
                    <p className="text-sm text-muted-foreground">{description}</p>
                    {note && <p className="text-xs text-muted-foreground/80">{note}</p>}
                </div>
                {action && <div className="sm:shrink-0">{action}</div>}
            </div>
        );
    };

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 pb-24 pt-4 sm:pt-6">
            {/* ========== HERO ========== */}
            <div className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="h-24 bg-gradient-to-r from-primary/25 via-primary/10 to-violet-500/20 sm:h-28" />
                <div className="flex flex-col gap-4 px-6 pb-6 sm:flex-row sm:items-end">
                    <div className="relative -mt-12 w-fit shrink-0 self-start sm:-mt-14">
                        <Avatar className="h-24 w-24 rounded-2xl bg-card ring-4 ring-card sm:h-28 sm:w-28">
                            <AvatarImage src={avatarSrc} alt={displayName} className="object-cover" />
                            <AvatarFallback className="rounded-2xl bg-primary/10 text-3xl font-semibold text-primary">{initials}</AvatarFallback>
                        </Avatar>
                        {!isGuest && (
                            <>
                                <input
                                    ref={avatarInputRef}
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    className="hidden"
                                    onChange={handleAvatarChange}
                                />
                                <Button
                                    size="icon"
                                    className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full shadow-md ring-2 ring-card"
                                    disabled={uploadAvatar.isPending}
                                    aria-label={t('profilePage.avatar.change')}
                                    title={t('profilePage.avatar.change')}
                                    onClick={() => avatarInputRef.current?.click()}
                                >
                                    {uploadAvatar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                                </Button>
                            </>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1 sm:pb-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="break-words text-2xl font-bold tracking-tight">{displayName}</h1>
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                                {t(`profilePage.roleBadge.${role}`, { defaultValue: role })}
                            </span>
                        </div>
                        {email && (
                            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                                <Mail className="h-3.5 w-3.5" />
                                {email}
                            </p>
                        )}
                    </div>
                    {!isGuest && (
                        <div className="flex items-center gap-3 rounded-xl border bg-muted/30 px-4 py-2.5 sm:shrink-0">
                            <ShieldCheck className={`h-5 w-5 ${protections >= 2 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`} />
                            <div>
                                <p className="text-xs text-muted-foreground">{t('profilePage.securityLevel')}</p>
                                <p className="text-sm font-semibold">{t('profilePage.protections', { count: protections, total: 3 })}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-5">
                {/* ========== INFORMATION ========== */}
                <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-span-2">
                    <div className="flex items-start gap-3 border-b px-6 py-4">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <User className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="font-semibold leading-tight">{t('profilePage.info.title')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('profilePage.info.description')}</p>
                        </div>
                    </div>
                    <div className="space-y-5 px-6 py-5">
                        <div className="space-y-2">
                            <Label htmlFor="fullname">{t('profilePage.info.fullName')}</Label>
                            <Input
                                id="fullname"
                                value={fullname ?? currentUser?.fullname ?? ''}
                                onChange={event => setFullname(event.target.value)}
                                maxLength={255}
                                placeholder={t('profilePage.info.fullNamePlaceholder')}
                                disabled={isGuest || saveProfile.isPending}
                                className={isGuest ? "bg-muted" : ""}
                            />
                            <p className="text-xs text-muted-foreground">{t('profilePage.info.fullNameHint')}</p>
                        </div>

                        <dl className="divide-y rounded-lg border">
                            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                                <dt className="text-xs font-medium text-muted-foreground">{t('profilePage.info.email')}</dt>
                                <dd className="min-w-0 truncate text-right text-sm font-medium">{email || '—'}</dd>
                            </div>
                            <div className="flex items-start justify-between gap-3 px-3 py-2.5">
                                <dt className="text-xs font-medium text-muted-foreground">{t('profilePage.info.role')}</dt>
                                <dd className="text-right text-sm font-medium">{t(`profilePage.roleLong.${role}`, { defaultValue: role })}</dd>
                            </div>
                        </dl>
                        <p className="text-xs text-muted-foreground">{t('profilePage.info.readOnlyHint')}</p>
                    </div>
                    {!isGuest && (
                        <div className="flex justify-end border-t bg-muted/30 px-6 py-3">
                            <Button
                                className="gap-2"
                                disabled={saveProfile.isPending || fullname === null || fullname.trim() === (currentUser?.fullname ?? '')}
                                onClick={() => saveProfile.mutate(fullname ?? currentUser?.fullname ?? '')}
                            >
                                {saveProfile.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                {saveProfile.isPending ? t('common.loading') : t('common.save')}
                            </Button>
                        </div>
                    )}
                </section>

                {/* ========== SECURITY ========== */}
                <section className="overflow-hidden rounded-xl border bg-card shadow-sm lg:col-span-3">
                    <div className="flex items-start gap-3 border-b px-6 py-4">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                            <Shield className="h-4 w-4" />
                        </span>
                        <div>
                            <h2 className="font-semibold leading-tight">{t('profilePage.security.title')}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">{t('profilePage.security.description')}</p>
                        </div>
                    </div>
                    <div className="divide-y">
                        {securityRow(
                            Lock,
                            'bg-sky-500/10 text-sky-700 dark:text-sky-400',
                            t('profilePage.security.password'),
                            t('profilePage.security.passwordDescription'),
                            statusPill('on'),
                            !isGuest && (
                                <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
                                    {t('profile.changePassword.title')}
                                </Button>
                            ),
                        )}
                        {securityRow(
                            Smartphone,
                            'bg-violet-500/10 text-violet-700 dark:text-violet-400',
                            t('profilePage.security.mfa'),
                            !mfaEnabled
                                ? t('profilePage.security.mfaDisabled')
                                : userHasMfa
                                    ? t('profilePage.security.mfaEnabled')
                                    : t('profilePage.security.mfaNone'),
                            <>
                                {statusPill(!mfaEnabled ? 'unavailable' : userHasMfa ? 'on' : 'off')}
                                {mfaEnforced && statusPill('required')}
                            </>,
                            mfaEnabled && !isGuest && (
                                <Button variant={userHasMfa ? 'outline' : 'default'} onClick={() => setIsMfaDialogOpen(true)}>
                                    {t(userHasMfa ? 'profileSettings.manageMfa' : 'profileSettings.configureMfa')}
                                </Button>
                            ),
                            !mfaEnabled ? t('profilePage.security.mfaContact') : undefined,
                        )}
                        {securityRow(
                            KeyIcon,
                            'bg-amber-500/10 text-amber-700 dark:text-amber-400',
                            t('profilePage.security.passkeys'),
                            !passkeysEnabled ? t('profilePage.security.passkeysDisabled') : t('profilePage.security.passkeysDescription'),
                            <>
                                {statusPill(!passkeysEnabled ? 'unavailable' : userHasPasskeys ? 'on' : 'off')}
                                {passkeysEnforced && statusPill('required')}
                            </>,
                            passkeysEnabled && !isGuest && (
                                <Button variant={userHasPasskeys ? 'outline' : 'default'} onClick={() => setIsPasskeysDialogOpen(true)}>
                                    {userHasPasskeys ? t('profilePage.security.managePasskeys') : t('profilePage.security.addPasskey')}
                                </Button>
                            ),
                            !passkeysEnabled ? t('profilePage.security.passkeysContact') : t('profileSettings.passkeyNote'),
                        )}
                    </div>
                </section>
            </div>

            {/* Dialogs */}
            <ChangePasswordDialog
                open={isPasswordDialogOpen}
                onOpenChange={setIsPasswordDialogOpen}
            />

            {isMfaDialogOpen && <MfaSetupDialog
                open={isMfaDialogOpen}
                onOpenChange={open => { setIsMfaDialogOpen(open); if (!open) client.invalidateQueries({ queryKey: profileKey }); }}
                isEnforced={mfaEnforced}
                hasExistingMfa={userHasMfa}
            />}

            <PasskeysManageDialog
                open={isPasskeysDialogOpen}
                onOpenChange={setIsPasskeysDialogOpen}
                isEnforced={passkeysEnforced}
                hasExistingPasskeys={userHasPasskeys}
            />
        </div>
    );
}
