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
import { Loader2, Copy, Check, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { authApi } from '@/api/auth';

interface MfaSetupDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isEnforced: boolean;
    hasExistingMfa: boolean;
}

export function MfaSetupDialog({ open, onOpenChange, isEnforced, hasExistingMfa }: MfaSetupDialogProps) {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [step, setStep] = useState<'methods' | 'totp-setup' | 'backup-codes' | 'manage'>(
        hasExistingMfa ? 'manage' : 'methods'
    );
    const [verificationCode, setVerificationCode] = useState('');
    const [copiedSecret, setCopiedSecret] = useState(false);
    const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

    const [totpSecret, setTotpSecret] = useState('');
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [backupCodes, setBackupCodes] = useState<string[]>([]);

    const handleCopySecret = () => {
        navigator.clipboard.writeText(totpSecret);
        setCopiedSecret(true);
        toast.success(t('mfaSetup.toasts.secretCopied'));
        setTimeout(() => setCopiedSecret(false), 2000);
    };

    const handleCopyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        setCopiedBackupCodes(true);
        toast.success(t('mfaSetup.toasts.codesCopied'));
        setTimeout(() => setCopiedBackupCodes(false), 2000);
    };

    const handleGenerateTOTP = async () => {
        setIsLoading(true);
        try {
            const data = await authApi.mfaGenerate();
            setTotpSecret(data.secret);
            setQrCodeUrl(data.qrCodeUrl);
            setStep('totp-setup');
        } catch {
            toast.error(t('mfaSetup.toasts.generateFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleEnableTOTP = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error(t('mfaSetup.toasts.invalidFormat'));
            return;
        }

        setIsLoading(true);
        try {
            const data = await authApi.mfaEnable(verificationCode);
            setBackupCodes(data.recoveryCodes);
            toast.success(t('mfaSetup.toasts.enabled'));
            setStep('backup-codes');
        } catch {
            toast.error(t('mfaSetup.toasts.invalidCode'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisableMFA = async () => {
        if (isEnforced) {
            toast.error(t('mfaSetup.toasts.enforced'));
            return;
        }

        setIsLoading(true);
        try {
            await authApi.mfaDisable();
            toast.success(t('mfaSetup.toasts.disabled'));
            onOpenChange(false);
        } catch {
            toast.error(t('mfaSetup.toasts.disableFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleClose = () => {
        setStep(hasExistingMfa ? 'manage' : 'methods');
        setVerificationCode('');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        {hasExistingMfa ? t('mfaSetup.manageTitle') : t('mfaSetup.setupTitle')}
                    </DialogTitle>
                    <DialogDescription>
                        {hasExistingMfa
                            ? t('mfaSetup.manageDescription')
                            : t('mfaSetup.setupDescription')}
                    </DialogDescription>
                </DialogHeader>

                {/* Method Selection */}
                {step === 'methods' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            {t('mfaSetup.chooseMethod')}
                        </p>

                        <Button
                            variant="outline"
                            className="w-full justify-start h-auto whitespace-normal py-3"
                            onClick={handleGenerateTOTP}
                            disabled={isLoading}
                        >
                            <div className="text-left">
                                <div className="font-medium items-center flex gap-2">
                                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {t('mfaSetup.authenticatorApp')}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    {t('mfaSetup.authenticatorAppHint')}
                                </div>
                            </div>
                        </Button>
                    </div>
                )}

                {/* TOTP Setup */}
                {step === 'totp-setup' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{t('mfaSetup.scanQr')}</Label>
                            <div className="flex justify-center p-4 border rounded-lg bg-white">
                                {qrCodeUrl ? (
                                    <img src={qrCodeUrl} alt={t('mfaSetup.qrAlt')} className="w-48 h-48" />
                                ) : (
                                    <div className="w-48 h-48 bg-muted flex items-center justify-center">
                                        {t('common.loading')}
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                {t('mfaSetup.scanHint')}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>{t('mfaSetup.enterManually')}</Label>
                            <div className="flex gap-2">
                                <Input
                                    value={totpSecret}
                                    readOnly
                                    className="font-mono"
                                />
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="outline"
                                    onClick={handleCopySecret}
                                >
                                    {copiedSecret ? (
                                        <Check className="h-4 w-4" />
                                    ) : (
                                        <Copy className="h-4 w-4" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="verification-code">{t('mfaSetup.enterCode')}</Label>
                            <Input
                                id="verification-code"
                                placeholder="000000"
                                maxLength={6}
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            />
                            <p className="text-sm text-muted-foreground">
                                {t('mfaSetup.codeHint')}
                            </p>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep('methods')}
                            >
                                {t('common.back')}
                            </Button>
                            <Button onClick={handleEnableTOTP} disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {t('mfaSetup.enable')}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* Backup Codes */}
                {step === 'backup-codes' && (
                    <div className="space-y-4">
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>{t('mfaSetup.saveCodesTitle')}</AlertTitle>
                            <AlertDescription>
                                {t('mfaSetup.saveCodesBody')}
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>{t('mfaSetup.backupCodes')}</Label>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCopyBackupCodes}
                                >
                                    {copiedBackupCodes ? (
                                        <>
                                            <Check className="mr-2 h-4 w-4" />
                                            {t('mfaSetup.copied')}
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-2 h-4 w-4" />
                                            {t('mfaSetup.copyAll')}
                                        </>
                                    )}
                                </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 p-4 border rounded-lg bg-muted/50 font-mono text-sm">
                                {backupCodes.map((code, index) => (
                                    <div key={index}>{code}</div>
                                ))}
                            </div>
                        </div>

                        <DialogFooter>
                            <Button onClick={handleClose}>
                                {t('mfaSetup.done')}
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* Manage MFA */}
                {step === 'manage' && (
                    <div className="space-y-4">
                        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm">
                            <div className="font-medium text-green-900 dark:text-green-100">
                                {t('mfaSetup.enabledTitle')}
                            </div>
                            <div className="text-green-700 dark:text-green-300">
                                {t('mfaSetup.enabledBody')}
                            </div>
                        </div>

                        <div className="space-y-2">
                            {backupCodes.length > 0 ? <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setStep('backup-codes')}
                            >
                                {t('mfaSetup.viewCodes')}
                            </Button> : <p className="text-sm text-muted-foreground">{t('profileSettings.recoveryCodesNote')}</p>}

                            {!isEnforced && (
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleDisableMFA}
                                    disabled={isLoading}
                                >
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {t('mfaSetup.disable')}
                                </Button>
                            )}

                            {isEnforced && (
                                <p className="text-sm text-muted-foreground text-center">
                                    {t('mfaSetup.enforcedNote')}
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
