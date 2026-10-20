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
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Loader2, Lock, Shield, Key as KeyIcon, Upload } from 'lucide-react';
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

    return (
        <div className="w-full flex justify-center px-4">
            <div className="w-full max-w-4xl py-8 space-y-8">
            {/* Header */}
            <div className="flex items-start gap-6">
                <Avatar className="h-20 w-20">
                    <AvatarImage src={avatarSrc} alt={displayName} />
                    <AvatarFallback className="text-2xl">{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-bold">{displayName}</h1>
                        <Badge variant={role === 'GUEST' ? 'secondary' : role === 'USER' ? 'secondary' : 'default'}>
                            {t(`profilePage.roleBadge.${role}`, { defaultValue: role })}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">{email}</p>
                </div>
            </div>

            <Separator />

            {/* Profile Information */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('profilePage.info.title')}</CardTitle>
                    <CardDescription>
                        {t('profilePage.info.description')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                        <Avatar className="h-16 w-16">
                            <AvatarImage src={avatarSrc} alt={displayName} />
                            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
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
                                    variant="outline"
                                    size="sm"
                                    disabled={uploadAvatar.isPending}
                                    onClick={() => avatarInputRef.current?.click()}
                                >
                                    {uploadAvatar.isPending ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <Upload className="mr-2 h-4 w-4" />
                                    )}
                                    {t('profilePage.avatar.change')}
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
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
                            <p className="text-sm text-muted-foreground">
                                {t('profilePage.info.fullNameHint')}
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">{t('profilePage.info.email')}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-sm text-muted-foreground">
                                {t('profilePage.info.emailHint')}
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="role">{t('profilePage.info.role')}</Label>
                            <Input
                                id="role"
                                value={t(`profilePage.roleLong.${role}`, { defaultValue: role })}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-sm text-muted-foreground">
                                {t('profilePage.info.roleHint')}
                            </p>
                        </div>
                    </div>

                    {!isGuest && (
                        <div className="flex justify-end">
                            <Button disabled={saveProfile.isPending || fullname === null || fullname.trim() === (currentUser?.fullname ?? '')}
                                onClick={() => saveProfile.mutate(fullname ?? currentUser?.fullname ?? '')}>
                                {saveProfile.isPending ? t('common.loading') : t('common.save')}
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Security Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        {t('profilePage.security.title')}
                    </CardTitle>
                    <CardDescription>
                        {t('profilePage.security.description')}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Password */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-medium">{t('profilePage.security.password')}</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {t('profilePage.security.passwordDescription')}
                                </p>
                            </div>
                            {!isGuest && (
                                <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
                                    {t('profile.changePassword.title')}
                                </Button>
                            )}
                        </div>
                    </div>

                    <Separator />

                    {/* MFA */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-medium">{t('profilePage.security.mfa')}</h3>
                                    {mfaEnforced && (
                                        <Badge variant="destructive" className="text-xs">{t('profilePage.security.required')}</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {!mfaEnabled
                                        ? t('profilePage.security.mfaDisabled')
                                        : userHasMfa
                                            ? t('profilePage.security.mfaEnabled')
                                            : t('profilePage.security.mfaNone')}
                                </p>
                            </div>
                            {mfaEnabled && !isGuest && (
                                <Button
                                    variant={userHasMfa ? 'outline' : 'default'}
                                    onClick={() => setIsMfaDialogOpen(true)}
                                >
                                    {t(userHasMfa ? 'profileSettings.manageMfa' : 'profileSettings.configureMfa')}
                                </Button>
                            )}
                        </div>

                        {!mfaEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                {t('profilePage.security.mfaContact')}
                            </div>
                        )}
                    </div>

                    <Separator />

                    {/* Passkeys */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <KeyIcon className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-medium">{t('profilePage.security.passkeys')}</h3>
                                    {passkeysEnforced && (
                                        <Badge variant="destructive" className="text-xs">{t('profilePage.security.required')}</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {!passkeysEnabled
                                        ? t('profilePage.security.passkeysDisabled')
                                        : t('profilePage.security.passkeysDescription')}
                                </p>
                            </div>
                            {passkeysEnabled && !isGuest && (
                                <Button
                                    variant={userHasPasskeys ? 'outline' : 'default'}
                                    onClick={() => setIsPasskeysDialogOpen(true)}
                                >
                                    {userHasPasskeys ? t('profilePage.security.managePasskeys') : t('profilePage.security.addPasskey')}
                                </Button>
                            )}
                        </div>

                        {!passkeysEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                {t('profilePage.security.passkeysContact')}
                            </div>
                        )}

                        {passkeysEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                {t('profileSettings.passkeyNote')}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

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
        </div>
    );
}
