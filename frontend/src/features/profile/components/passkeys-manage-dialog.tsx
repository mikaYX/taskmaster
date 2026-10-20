import { assertPasskeyOrigin, passkeyErrorMessage } from '@/lib/passkeys';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
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
import { Loader2, Trash2, Fingerprint, Laptop } from 'lucide-react';
import { toast } from 'sonner';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { startRegistration } from '@simplewebauthn/browser';
import { authApi } from '@/api/auth';

interface PasskeysManageDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isEnforced: boolean;
    hasExistingPasskeys: boolean;
}

export function PasskeysManageDialog({
    open,
    onOpenChange,
    isEnforced,
}: PasskeysManageDialogProps) {
    const { t } = useTranslation();
    const dateCode = getDateLocale().code;
    const [step, setStep] = useState<'list' | 'add'>('list');
    const [passkeyName, setPasskeyName] = useState('');
    const [passkeyToDelete, setPasskeyToDelete] = useState<string | null>(null);

    const queryClient = useQueryClient();

    const { data: passkeys = [], isLoading: isLoadingPasskeys } = useQuery({
        queryKey: ['passkeys'],
        queryFn: async () => {
            return await authApi.listPasskeys();
        },
        enabled: open,
    });

    const addMutation = useMutation({
        mutationFn: async (name: string) => {
            const options = await authApi.generatePasskeyRegistrationOptions();
            assertPasskeyOrigin(options.rp?.id);
            const attResp = await startRegistration({ optionsJSON: options });
            const verifyRes = await authApi.verifyPasskeyRegistration({
                response: attResp,
                name: name,
            });
            if (!verifyRes.verified) {
                throw new Error('Verification failed');
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['passkeys'] });
            toast.success(t('passkeysManage.toasts.added'));
            setPasskeyName('');
            setStep('list');
        },
        onError: (err: unknown) => {
            toast.error(passkeyErrorMessage(err, t('passkeysManage.toasts.addFailed')));
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await authApi.deletePasskey(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['passkeys'] });
            toast.success(t('passkeysManage.toasts.removed'));
            setPasskeyToDelete(null);
        },
        onError: () => {
            toast.error(t('passkeysManage.toasts.removeFailed'));
        },
    });

    const handleAddPasskey = async () => {
        if (!passkeyName.trim()) {
            toast.error(t('passkeysManage.toasts.nameRequired'));
            return;
        }

        addMutation.mutate(passkeyName);
    };

    const handleDeletePasskey = async (id: string) => {
        if (isEnforced && passkeys.length === 1) {
            toast.error(t('passkeysManage.toasts.keepOne'));
            return;
        }

        deleteMutation.mutate(id);
    };

    const getPasskeyIcon = (deviceType: string) => {
        // SimpleWebAuthn's deviceType is usually 'singleDevice' or 'multiDevice'
        return deviceType === 'singleDevice' ? (
            <Fingerprint className="h-4 w-4" />
        ) : (
            <Laptop className="h-4 w-4" />
        );
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {step === 'list' ? t('passkeysManage.manageTitle') : t('passkeysManage.addTitle')}
                        </DialogTitle>
                        <DialogDescription>
                            {step === 'list'
                                ? t('passkeysManage.listDescription')
                                : t('passkeysManage.addDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    {step === 'list' && (
                        <div className="space-y-4">
                            {isLoadingPasskeys ? (
                                <div className="flex justify-center py-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                                </div>
                            ) : passkeys.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    <Fingerprint className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p className="text-sm">{t('passkeysManage.none')}</p>
                                    <p className="text-xs">{t('passkeysManage.noneHint')}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {passkeys.map((passkey) => (
                                        <div
                                            key={passkey.id}
                                            className="flex items-start justify-between rounded-lg border p-3"
                                        >
                                            <div className="flex items-start gap-3">
                                                <div className="mt-0.5">
                                                    {getPasskeyIcon(passkey.deviceType)}
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="font-medium">{passkey.name || passkey.deviceType}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {t('passkeysManage.added', { date: new Date(passkey.createdAt).toLocaleDateString(dateCode) })}
                                                        {passkey.lastUsedAt && (
                                                            <> · {t('passkeysManage.lastUsed', { date: new Date(passkey.lastUsedAt).toLocaleDateString(dateCode) })}</>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={() => setPasskeyToDelete(passkey.id)}
                                                disabled={isEnforced && passkeys.length === 1}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {isEnforced && (
                                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                                    <Trans i18nKey="passkeysManage.enforcedNote" components={{ strong: <strong /> }} />
                                </div>
                            )}

                            <DialogFooter>
                                <Button onClick={() => setStep('add')}>
                                    {t('passkeysManage.add')}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}

                    {step === 'add' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="passkey-name">{t('passkeysManage.name')}</Label>
                                <Input
                                    id="passkey-name"
                                    placeholder={t('passkeysManage.namePlaceholder')}
                                    value={passkeyName}
                                    onChange={(e) => setPasskeyName(e.target.value)}
                                    autoFocus
                                />
                                <p className="text-sm text-muted-foreground">
                                    {t('passkeysManage.nameHint')}
                                </p>
                            </div>

                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground space-y-2">
                                <div><strong>{t('passkeysManage.whatNext')}</strong></div>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                    <li>{t('passkeysManage.step1')}</li>
                                    <li>{t('passkeysManage.step2')}</li>
                                    <li>{t('passkeysManage.step3')}</li>
                                </ol>
                            </div>

                            <DialogFooter>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setStep('list');
                                        setPasskeyName('');
                                    }}
                                    disabled={addMutation.isPending}
                                >
                                    {t('common.cancel')}
                                </Button>
                                <Button onClick={handleAddPasskey} disabled={addMutation.isPending}>
                                    {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {t('passkeysManage.create')}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={!!passkeyToDelete} onOpenChange={() => setPasskeyToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('passkeysManage.removeTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('passkeysManage.removeBody')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => passkeyToDelete && handleDeletePasskey(passkeyToDelete)}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('passkeysManage.remove')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
