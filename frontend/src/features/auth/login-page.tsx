import { passkeyErrorMessage } from '@/lib/passkeys';
import { loginCardStyle, parseLoginCardOpacity, parseWallpaperBlur, parseWallpaperDim, pickLogo, wallpaperLayerStyle } from './login-card-style';
import { useIsDark } from '@/hooks/use-is-dark';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ClipboardCheck, Fingerprint } from 'lucide-react';
import { useLogin, useVerifyMfaLogin, usePasskeyLogin } from '@/hooks';
import { settingsApi } from '@/api/settings';
import { authApi } from '@/api/auth';

function parseLoginSearch(search: string) {
    const params = new URLSearchParams(search);
    const ssoTicket = params.get('sso_ticket');
    // One-time link issued by an administrator for a TV screen.
    const guestTicket = params.get('guest_ticket');

    // SECURITY (AUDIT.md Finding #1): the previous `?u=<username>&p=<password>`
    // auto-login mode for Guest/TV deployments has been removed entirely.
    // Passwords in URL leak through browser history, the Referer header, every
    // reverse-proxy/CDN access log, bookmarks and screen-sharing tools. The
    // only supported password-less entry path is the server-issued
    // `sso_ticket` (one-time, short TTL, single-use, IP-bound) handled below.
    return { ssoTicket, guestTicket };
}

export function LoginPage() {
    const { t } = useTranslation();
    const [usernameOverride, setUsernameOverride] = useState<string | null>(null);
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [requiresMfa, setRequiresMfa] = useState(false);
    const [mfaToken, setMfaToken] = useState('');
    const location = useLocation();
    const { ssoTicket, guestTicket } = useMemo(
        () => parseLoginSearch(location.search),
        [location.search],
    );
    const username = usernameOverride ?? '';

    const { mutate: login, isPending: isLoginPending } = useLogin();
    const { mutate: verifyMfa, isPending: isVerifyPending } = useVerifyMfaLogin();
    const { mutate: passkeyLogin, isPending: isPasskeyPending } = usePasskeyLogin();

    // SSO ticket exchange — the ONLY supported password-less entry path
    // (AUDIT.md Finding #1). Any other auto-login attempt via query string is
    // intentionally ignored: passwords MUST NOT travel through the URL.
    useEffect(() => {
        if (ssoTicket) {
            authApi.exchangeSsoTicket(ssoTicket).then(() => {
                window.location.replace('/');
            }).catch(() => {
                console.error('SSO ticket exchange failed');
            });
        }
    }, [ssoTicket]);

    // TV login link: swapped once for a long session, then the URL is left behind.
    const guestTicketUsed = useRef(false);
    useEffect(() => {
        if (!guestTicket || guestTicketUsed.current) return;
        guestTicketUsed.current = true;
        authApi.exchangeGuestTicket(guestTicket).then(() => {
            window.location.replace('/');
        }).catch(() => {
            toast.error(t('auth.guestLinkInvalid'));
        });
    }, [guestTicket, t]);

    // Public branding settings (no auth required)
    const { data: branding } = useQuery({
        queryKey: ['public-branding'],
        queryFn: settingsApi.getPublicBranding,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
    const appTitle = (branding?.['app.title'] as string) || t('common.appName');
    const isDark = useIsDark();
    const appLogo = pickLogo(isDark, branding?.['app.logoUrl'] as string | undefined, branding?.['app.logoDarkUrl'] as string | undefined);
    const welcomeText = (branding?.['app.loginWelcomeText'] as string | undefined)?.trim();
    const loginMessage = (branding?.['app.loginMessage'] as string | undefined)?.trim();
    const wallpaperBlur = parseWallpaperBlur(branding?.['app.wallpaperBlur'] as string | undefined);
    const wallpaperDim = parseWallpaperDim(branding?.['app.wallpaperDim'] as string | undefined);
    const appWallpaper = branding?.['app.wallpaperUrl'] as string | undefined;
    const cardOpacity = parseLoginCardOpacity(branding?.['app.loginCardOpacity'] as string | undefined);

    const oidcEnabled = branding?.['auth.generic.enabled'] === 'true' || branding?.['auth.generic.enabled'] === true;
    const oidcProviderName = (branding?.['auth.generic.oidc.providerName'] as string) || 'SSO Provider';
    const passkeysEnabled = branding?.['auth.passkeys.enabled'] === 'true' || branding?.['auth.passkeys.enabled'] === true;

    const handleOidcLogin = () => {
        const apiUrl = import.meta.env.VITE_API_URL || '/api';
        window.location.href = `${apiUrl}/auth/external/login/generic`;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        login(
            { username, password },
            {
                onSuccess: (data) => {
                    if ('requiresMfa' in data && data.requiresMfa) {
                        setRequiresMfa(true);
                        setMfaToken(data.mfaToken);
                    }
                },
                onError: (error: Error) => {
                    console.error('Login error:', error);
                    toast.error(t('auth.loginFailed'));
                },
            }
        );
    };

    const handleVerifyMfa = async (e: React.FormEvent) => {
        e.preventDefault();

        verifyMfa(
            { mfaToken, token: mfaCode },
            {
                onError: (error: Error) => {
                    console.error('MFA Verification error:', error);
                    toast.error(t('auth.invalidMfa'));
                },
            }
        );
    };

    const handlePasskeyLogin = async () => {
        passkeyLogin(undefined, {
            onError: (error: Error) => {
                console.error('Passkey login error:', error);

                // Exclude the cancellation error where the user closes the biometric prompt
                if (error?.name !== 'NotAllowedError') {
                    toast.error(passkeyErrorMessage(error, t('auth.passkeyFailed')));
                }
            },
        });
    };

    return (
        <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
            {appWallpaper && (
                <>
                    <div className="absolute inset-0 bg-cover bg-center" style={wallpaperLayerStyle(appWallpaper, wallpaperBlur)} aria-hidden="true" />
                    {wallpaperDim > 0 && (
                        <div className="absolute inset-0 bg-black" style={{ opacity: wallpaperDim / 100 }} aria-hidden="true" />
                    )}
                </>
            )}
            <Card className="relative w-full max-w-md" style={appWallpaper ? loginCardStyle(cardOpacity) : undefined}>
                <CardHeader className="text-center">
                    {appLogo ? (
                        <img
                            src={appLogo}
                            alt="Logo"
                            className="mx-auto mb-4 h-12 w-auto max-w-full object-contain rounded-md"
                        />
                    ) : (
                        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                            <ClipboardCheck className="h-6 w-6" />
                        </div>
                    )}
                    <CardTitle className="text-2xl">{appTitle}</CardTitle>
                    <CardDescription>
                        {requiresMfa ? 'Enter your 6-digit Authenticator code' : (welcomeText || t('auth.signInToAccount'))}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!requiresMfa ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="username">
                                    {t('auth.username')}
                                </label>
                                <Input
                                    id="username"
                                    type="text"
                                    placeholder={t('auth.enterUsername')}
                                    value={username}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsernameOverride(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="password">
                                    {t('auth.password')}
                                </label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder={t('auth.enterPassword')}
                                    value={password}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" disabled={isLoginPending || isPasskeyPending}>
                                    {isLoginPending ? t('auth.signingIn') : t('auth.signIn')}
                                </Button>
                            </div>
                            {(passkeysEnabled || oidcEnabled) && (
                                <div className="relative">
                                    <div className="absolute inset-0 flex items-center">
                                        <span className="w-full border-t" />
                                    </div>
                                    <div className="relative flex justify-center text-xs uppercase">
                                        <span className="bg-background px-2 text-muted-foreground">
                                            Or
                                        </span>
                                    </div>
                                </div>
                            )}
                            {passkeysEnabled && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full"
                                    onClick={handlePasskeyLogin}
                                    disabled={isPasskeyPending || isLoginPending}
                                >
                                    <Fingerprint className="mr-2 h-4 w-4" />
                                    Sign in with Passkey
                                </Button>
                            )}
                            {oidcEnabled && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full mt-2"
                                    onClick={handleOidcLogin}
                                    disabled={isPasskeyPending || isLoginPending}
                                >
                                    Sign in with {oidcProviderName}
                                </Button>
                            )}
                        </form>
                    ) : (
                        <form onSubmit={handleVerifyMfa} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium" htmlFor="mfaCode">
                                    MFA Code
                                </label>
                                <Input
                                    id="mfaCode"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    maxLength={6}
                                    placeholder="000000"
                                    value={mfaCode}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setMfaCode(e.target.value)}
                                    required
                                    autoFocus
                                    className="text-center text-lg tracking-widest"
                                />
                            </div>
                            <div className="flex justify-end space-x-2">
                                <Button type="button" variant="outline" onClick={() => setRequiresMfa(false)} disabled={isVerifyPending}>
                                    Back
                                </Button>
                                <Button type="submit" disabled={isVerifyPending}>
                                    {isVerifyPending ? 'Verifying...' : 'Verify'}
                                </Button>
                            </div>
                        </form>
                    )}
                    {loginMessage && !requiresMfa && (
                        <p className="mt-6 whitespace-pre-line rounded-md border bg-muted/40 px-3 py-2 text-center text-xs text-muted-foreground">
                            {loginMessage}
                        </p>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
