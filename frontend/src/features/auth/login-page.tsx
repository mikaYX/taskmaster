import { useState, useEffect } from 'react';
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

export function LoginPage() {
    const { t } = useTranslation();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [mfaCode, setMfaCode] = useState('');
    const [requiresMfa, setRequiresMfa] = useState(false);
    const [mfaToken, setMfaToken] = useState('');

    const location = useLocation();

    const { mutate: login, isPending: isLoginPending } = useLogin();
    const { mutate: verifyMfa, isPending: isVerifyPending } = useVerifyMfaLogin();
    const { mutate: passkeyLogin, isPending: isPasskeyPending } = usePasskeyLogin();

    // URL-based auto-login (for TV Links / Guest) and SSO ticket exchange
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const ssoTicket = params.get('sso_ticket');
        let autoUser = params.get('u');
        let autoPass = params.get('p');

        // Fallback: some clients mangle the URL (e.g. u= becomes u-). Try to recover u/p from search string.
        if (!autoUser && location.search) {
            const match = location.search.match(/[?&]u=([^&]+)/) ?? location.search.match(/[?&]u-([^&/]+)/);
            if (match) autoUser = decodeURIComponent(match[1].replace(/%2F/g, '/'));
        }
        if (!autoPass && location.search && autoUser) {
            const match = location.search.match(/[?&]p=([^&]+)/) ?? location.search.match(/[?&]p-([^&/]+)/);
            if (match) autoPass = decodeURIComponent(match[1]);
        }

        if (ssoTicket) {
            authApi.exchangeSsoTicket(ssoTicket).then((tokens) => {
                localStorage.setItem('accessToken', tokens.accessToken);
                window.location.replace('/');
            }).catch(() => {
                console.error('SSO ticket exchange failed');
            });
        } else if (autoUser && autoPass && !requiresMfa) {
            // Full auto-login for Guest/TV Links when u and p are present
            login({ username: autoUser, password: autoPass }, {
                onSuccess: () => {
                    window.location.replace('/');
                },
                onError: () => {
                    console.error('Auto-login failed');
                }
            });
        } else if (autoUser) {
            // Only u in URL: pre-fill username so user just enters password
            setUsername(autoUser);
        }
    }, [location.search, login, requiresMfa]);

    // Public branding settings (no auth required)
    const { data: branding } = useQuery({
        queryKey: ['public-branding'],
        queryFn: settingsApi.getPublicBranding,
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
    const appTitle = (branding?.['app.title'] as string) || t('common.appName');
    const appLogo = branding?.['app.logoUrl'] as string | undefined;

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
                    toast.error(t('auth.passkeyFailed'));
                }
            },
        });
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
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
                        {requiresMfa ? 'Enter your 6-digit Authenticator code' : t('auth.signInToAccount')}
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
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
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
                </CardContent>
            </Card>
        </div>
    );
}
