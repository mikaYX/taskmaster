import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/stores';
import { useUsers, useUploadMyAvatar } from '@/hooks/use-users';
import { useSettings } from '@/features/settings/hooks/use-settings';
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
    useTranslation();
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
    const { data: users, isLoading: usersLoading } = useUsers();
    const { getSetting, isLoading: settingsLoading } = useSettings();
    const uploadAvatar = useUploadMyAvatar();
    const avatarInputRef = useRef<HTMLInputElement>(null);

    const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
    const [isMfaDialogOpen, setIsMfaDialogOpen] = useState(false);
    const [isPasskeysDialogOpen, setIsPasskeysDialogOpen] = useState(false);
    const [localAvatarSrc, setLocalAvatarSrc] = useState<string | undefined>(undefined);

    const currentUser = users?.find(u => u.id === userId);
    // avatarUrl is a path like /public/uploads/..., served outside /api — strip /api suffix from base URL
    const storageBase = (import.meta.env.VITE_API_URL ?? '').replace(/\/api\/?$/, '');
    const remoteAvatarSrc = currentUser?.avatarUrl ? `${storageBase}${currentUser.avatarUrl}` : undefined;
    const avatarSrc = localAvatarSrc ?? remoteAvatarSrc;
    const displayName = currentUser?.fullname || currentUser?.username || 'User';
    const email = currentUser?.email || '';
    const role = currentUser?.role || 'USER';
    const initials = displayName.substring(0, 2).toUpperCase();

    // Get security settings from admin configuration
    const mfaEnabled = true; // Always available if methods are configured, fallback to enforcing checks
    const mfaEnforced = getSetting('auth.mfa.required') === 'true';

    // Passkey enforcement dynamically from backend session
    const passkeysEnforced = passkeyPolicy === 'required';
    const userHasPasskeys = hasPasskey;

    // TODO: Get user's actual MFA status from backend
    const userHasMfa = false; // Replace with actual API call

    const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const allowed = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowed.includes(file.type)) {
            toast.error('Format non supporté. Utilisez PNG, JPG ou WebP.');
            return;
        }
        const objectUrl = URL.createObjectURL(file);
        setLocalAvatarSrc(objectUrl);
        try {
            const result = await uploadAvatar.mutateAsync(file);
            setLocalAvatarSrc(`${storageBase}${result.url}`);
            toast.success('Avatar mis à jour');
        } catch {
            setLocalAvatarSrc(undefined);
            toast.error("Échec de la mise à jour de l'avatar");
        }
        e.target.value = '';
    };

    if (usersLoading || settingsLoading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

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
                            {role === 'SUPER_ADMIN' ? 'Super Admin'
                                : role === 'ADMIN' ? 'Admin'
                                : role === 'MANAGER' ? 'Manager'
                                : role === 'GUEST' ? 'Guest'
                                : 'User'}
                        </Badge>
                    </div>
                    <p className="text-muted-foreground">{email}</p>
                </div>
            </div>

            <Separator />

            {/* Profile Information */}
            <Card>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                    <CardDescription>
                        Update your personal information and avatar
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
                                    Change Avatar
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="grid gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="fullname">Full Name</Label>
                            <Input
                                id="fullname"
                                defaultValue={currentUser?.fullname ?? ''}
                                placeholder="Your full name"
                                disabled={isGuest}
                                className={isGuest ? "bg-muted" : ""}
                            />
                            <p className="text-sm text-muted-foreground">
                                This is your display name across the application.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-sm text-muted-foreground">
                                Your email address cannot be changed.
                            </p>
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="role">Role</Label>
                            <Input
                                id="role"
                                value={
                                    role === 'SUPER_ADMIN' ? 'Super Administrator'
                                    : role === 'ADMIN' ? 'Administrator'
                                    : role === 'MANAGER' ? 'Manager'
                                    : role === 'USER' ? 'User'
                                    : 'Guest'
                                }
                                disabled
                                className="bg-muted"
                            />
                            <p className="text-sm text-muted-foreground">
                                Your role is managed by your administrator.
                            </p>
                        </div>
                    </div>

                    {!isGuest && (
                        <div className="flex justify-end">
                            <Button>Save Changes</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Security Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Security
                    </CardTitle>
                    <CardDescription>
                        Manage your password and authentication methods
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Password */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <Lock className="h-4 w-4 text-muted-foreground" />
                                    <h3 className="font-medium">Password</h3>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Change your account password
                                </p>
                            </div>
                            {!isGuest && (
                                <Button variant="outline" onClick={() => setIsPasswordDialogOpen(true)}>
                                    Change Password
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
                                    <h3 className="font-medium">Multi-Factor Authentication</h3>
                                    {mfaEnforced && (
                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {!mfaEnabled
                                        ? 'MFA is not enabled by your administrator.'
                                        : userHasMfa
                                            ? 'Add an extra layer of security to your account.'
                                            : 'Protect your account with two-factor authentication.'}
                                </p>
                            </div>
                            {mfaEnabled && !isGuest && (
                                <Button
                                    variant={userHasMfa ? 'outline' : 'default'}
                                    onClick={() => setIsMfaDialogOpen(true)}
                                >
                                    {userHasMfa ? 'Manage MFA' : 'Configure MFA'}
                                </Button>
                            )}
                        </div>

                        {!mfaEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                Contact your administrator to enable multi-factor authentication.
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
                                    <h3 className="font-medium">Passkeys (WebAuthn)</h3>
                                    {passkeysEnforced && (
                                        <Badge variant="destructive" className="text-xs">Required</Badge>
                                    )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {!passkeysEnabled
                                        ? 'Passkeys are not enabled by your administrator.'
                                        : 'Use biometrics or security keys for passwordless sign-in.'}
                                </p>
                            </div>
                            {passkeysEnabled && !isGuest && (
                                <Button
                                    variant={userHasPasskeys ? 'outline' : 'default'}
                                    onClick={() => setIsPasskeysDialogOpen(true)}
                                >
                                    {userHasPasskeys ? 'Manage Passkeys' : 'Add Passkey'}
                                </Button>
                            )}
                        </div>

                        {!passkeysEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                Contact your administrator to enable passkeys.
                            </div>
                        )}

                        {passkeysEnabled && (
                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                <strong>Note:</strong> Passkeys are stored on your device and never leave it.
                                They provide the most secure way to sign in.
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

            <MfaSetupDialog
                open={isMfaDialogOpen}
                onOpenChange={setIsMfaDialogOpen}
                isEnforced={mfaEnforced}
                hasExistingMfa={userHasMfa}
            />

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
