import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Fingerprint } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { authApi } from '@/api/auth';
import { useAuthStore } from '@/stores';
import { useLogout } from '@/hooks/use-auth';
import { LogOut } from 'lucide-react';

interface PasskeyOnboardingModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    policy: 'optional' | 'required';
}

export function PasskeyOnboardingModal({
    open,
    onOpenChange,
    policy,
}: PasskeyOnboardingModalProps) {
    const { t } = useTranslation();
    const [passkeyName, setPasskeyName] = useState('');
    const [step, setStep] = useState<'intro' | 'add'>('intro');

    const queryClient = useQueryClient();
    const logoutMutation = useLogout();

    const isRequired = policy === 'required';
    const isSyncingRef = useRef(false);

    const handleOpenChange = (newOpen: boolean) => {
        if (isRequired && !newOpen) {
            // Cannot close if required
            return;
        }
        onOpenChange(newOpen);
    };

    useEffect(() => {
        const handleSync = async () => {
            if (isSyncingRef.current) return;
            isSyncingRef.current = true;

            try {
                // Synchro multi-onglets : un autre onglet a validé le passkey
                await authApi.getSession();
                useAuthStore.setState({ hasPasskey: true });
                queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });
                onOpenChange(false); // Force close
            } catch (error) {
                console.error('[PasskeySync] Failed to synchronize state:', error);
            } finally {
                // Release lock after a short delay
                setTimeout(() => {
                    isSyncingRef.current = false;
                }, 1000);
            }
        };

        const channel = new BroadcastChannel('passkey-sync');
        channel.onmessage = (event) => {
            if (event.data === 'passkey-added') {
                handleSync();
            }
        };

        const handleStorage = (event: StorageEvent) => {
            if (event.key === 'passkey-sync-fallback' && event.newValue === 'passkey-added') {
                handleSync();
            }
        };

        window.addEventListener('storage', handleStorage);

        return () => {
            channel.close();
            window.removeEventListener('storage', handleStorage);
        };
    }, [onOpenChange, queryClient]);

    const addMutation = useMutation({
        mutationFn: async (name: string) => {
            const options = await authApi.generatePasskeyRegistrationOptions();
            const attResp = await startRegistration(options);
            const verifyRes = await authApi.verifyPasskeyRegistration({
                response: attResp,
                name: name,
            });
            if (!verifyRes.verified) {
                throw new Error('Verification failed');
            }
        },
        onSuccess: async () => {
            toast.success(t('auth.passkeyAddedSuccessfully', 'Passkey added successfully'));

            try {
                const channel = new BroadcastChannel('passkey-sync');
                channel.postMessage('passkey-added');
                channel.close();
            } catch (err) {
                console.warn('[PasskeySync] BroadcastChannel not supported or failed', err);
            }

            // Fallback passkey sync
            localStorage.setItem('passkey-sync-fallback', 'passkey-added');
            setTimeout(() => {
                localStorage.removeItem('passkey-sync-fallback');
            }, 500);

            // Refetch session to update hasPasskey flag
            await authApi.getSession();

            // This expects the session to return updated hasPasskey=true
            // To be safe, update store locally first
            useAuthStore.setState({ hasPasskey: true });

            queryClient.invalidateQueries({ queryKey: ['auth', 'session'] });

            onOpenChange(false);
        },
        onError: (err: unknown) => {
            const error = err as { name?: string; response?: { data?: { message?: string } } };
            if (error?.name === 'NotAllowedError') {
                toast.error(t('auth.passkeyRegistrationCancelled', 'Passkey registration cancelled'));
                return;
            }
            toast.error(error?.response?.data?.message || t('auth.passkeyAddFailed', 'Failed to add passkey'));
        },
    });

    const handleAddPasskey = async () => {
        if (!passkeyName.trim()) {
            toast.error(t('auth.passkeyNameRequired', 'Please enter a name for this passkey'));
            return;
        }

        addMutation.mutate(passkeyName);
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            {/* Prevent clicking outside to close if required */}
            <DialogContent className="sm:max-w-lg" onInteractOutside={(e) => isRequired && e.preventDefault()} onEscapeKeyDown={(e) => isRequired && e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>
                        {t('auth.setupPasskeyTitle', 'Setup a Passkey')}
                    </DialogTitle>
                    <DialogDescription>
                        {isRequired
                            ? t('auth.passkeyRequiredDesc', 'Your organization requires you to set up a passkey to access the application. This provides stronger, passwordless security.')
                            : t('auth.passkeyOptionalDesc', 'Enhance your account security and sign in faster by setting up a passkey. You can use your device biometrics (fingerprint, face) or a security key.')}
                    </DialogDescription>
                </DialogHeader>

                {step === 'intro' && (
                    <div className="space-y-4">
                        <div className="flex justify-center py-6 text-primary">
                            <Fingerprint className="h-16 w-16" />
                        </div>

                        <div className="space-y-2 text-sm text-muted-foreground text-center px-4">
                            <p>{t('auth.passkeyBenefits', 'Passkeys are a safer and easier replacement for passwords.')}</p>
                        </div>

                        <DialogFooter className="mt-6 flex sm:justify-between items-center sm:space-x-2 flex-col sm:flex-row gap-2">
                            {!isRequired && (
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={() => handleOpenChange(false)}
                                    className="w-full sm:w-auto order-last sm:order-first"
                                >
                                    {t('common.later', 'Later')}
                                </Button>
                            )}
                            <div className="flex w-full sm:w-auto gap-2">
                                {isRequired && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => logoutMutation.mutate()}
                                        disabled={logoutMutation.isPending}
                                        className="w-full sm:w-auto"
                                    >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        {t('common.logout', 'Log out')}
                                    </Button>
                                )}
                                <Button
                                    onClick={() => setStep('add')}
                                    className="w-full sm:w-auto"
                                >
                                    {t('auth.configureNow', 'Configure Now')}
                                </Button>
                            </div>
                        </DialogFooter>
                    </div>
                )}

                {step === 'add' && (
                    <div className="space-y-4 pt-4">
                        <div className="space-y-2">
                            <Label htmlFor="passkey-name">{t('auth.passkeyName', 'Device Name')}</Label>
                            <Input
                                id="passkey-name"
                                placeholder={t('auth.passkeyNamePlaceholder', 'My Phone, Work Laptop...')}
                                value={passkeyName}
                                onChange={(e) => setPasskeyName(e.target.value)}
                                autoFocus
                            />
                            <p className="text-sm text-muted-foreground">
                                {t('auth.passkeyNameHelp', 'Choose a name to help you identify this device later.')}
                            </p>
                        </div>

                        <DialogFooter className="pt-4">
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep('intro')}
                                disabled={addMutation.isPending || logoutMutation.isPending}
                            >
                                {t('common.back', 'Back')}
                            </Button>
                            <Button onClick={handleAddPasskey} disabled={addMutation.isPending || logoutMutation.isPending}>
                                {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('auth.createPasskey', 'Create Passkey')}
                            </Button>
                        </DialogFooter>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
