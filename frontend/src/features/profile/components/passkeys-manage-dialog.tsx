import { useState } from 'react';
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
    useTranslation();
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
            const attResp = await startRegistration(options);
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
            toast.success('Passkey added successfully');
            setPasskeyName('');
            setStep('list');
        },
        onError: (err: any) => {
            toast.error(err?.response?.data?.message || 'Failed to add passkey');
        },
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            await authApi.deletePasskey(id);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['passkeys'] });
            toast.success('Passkey removed successfully');
            setPasskeyToDelete(null);
        },
        onError: () => {
            toast.error('Failed to remove passkey');
        },
    });

    const handleAddPasskey = async () => {
        if (!passkeyName.trim()) {
            toast.error('Please enter a name for this passkey');
            return;
        }

        addMutation.mutate(passkeyName);
    };

    const handleDeletePasskey = async (id: string) => {
        if (isEnforced && passkeys.length === 1) {
            toast.error('You must have at least one passkey when enforcement is enabled');
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
                            {step === 'list' ? 'Manage Passkeys' : 'Add New Passkey'}
                        </DialogTitle>
                        <DialogDescription>
                            {step === 'list'
                                ? 'Use biometrics or security keys for passwordless sign-in.'
                                : 'Give your passkey a recognizable name.'}
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
                                    <p className="text-sm">No passkeys configured</p>
                                    <p className="text-xs">Add a passkey to enable passwordless sign-in</p>
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
                                                        Added {new Date(passkey.createdAt).toLocaleDateString()}
                                                        {passkey.lastUsedAt && (
                                                            <> · Last used {new Date(passkey.lastUsedAt).toLocaleDateString()}</>
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
                                    <strong>Note:</strong> Passkeys are required by your administrator.
                                    You must have at least one passkey configured.
                                </div>
                            )}

                            <DialogFooter>
                                <Button onClick={() => setStep('add')}>
                                    Add Passkey
                                </Button>
                            </DialogFooter>
                        </div>
                    )}

                    {step === 'add' && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="passkey-name">Passkey Name</Label>
                                <Input
                                    id="passkey-name"
                                    placeholder="My MacBook, YubiKey, etc."
                                    value={passkeyName}
                                    onChange={(e) => setPasskeyName(e.target.value)}
                                    autoFocus
                                />
                                <p className="text-sm text-muted-foreground">
                                    Choose a name that helps you identify this device or security key.
                                </p>
                            </div>

                            <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground space-y-2">
                                <div><strong>What happens next?</strong></div>
                                <ol className="list-decimal list-inside space-y-1 ml-2">
                                    <li>You'll be prompted to use your device biometrics or security key</li>
                                    <li>The passkey will be securely stored on your device</li>
                                    <li>You can use it to sign in without a password</li>
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
                                    Cancel
                                </Button>
                                <Button onClick={handleAddPasskey} disabled={addMutation.isPending}>
                                    {addMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Passkey
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
                        <AlertDialogTitle>Remove Passkey?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This passkey will no longer be able to sign in to your account.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => passkeyToDelete && handleDeletePasskey(passkeyToDelete)}
                            disabled={deleteMutation.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
