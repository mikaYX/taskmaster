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
    useTranslation();
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
        toast.success('Secret copied to clipboard');
        setTimeout(() => setCopiedSecret(false), 2000);
    };

    const handleCopyBackupCodes = () => {
        navigator.clipboard.writeText(backupCodes.join('\n'));
        setCopiedBackupCodes(true);
        toast.success('Backup codes copied to clipboard');
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
            toast.error('Failed to generate MFA setup');
        } finally {
            setIsLoading(false);
        }
    };

    const handleEnableTOTP = async () => {
        if (!verificationCode || verificationCode.length !== 6) {
            toast.error('Please enter a valid 6-digit code');
            return;
        }

        setIsLoading(true);
        try {
            const data = await authApi.mfaEnable(verificationCode);
            setBackupCodes(data.recoveryCodes);
            toast.success('MFA enabled successfully');
            setStep('backup-codes');
        } catch {
            toast.error('Invalid verification code');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisableMFA = async () => {
        if (isEnforced) {
            toast.error('MFA is required by your administrator');
            return;
        }

        setIsLoading(true);
        try {
            await authApi.mfaDisable();
            toast.success('MFA disabled successfully');
            onOpenChange(false);
        } catch {
            toast.error('Failed to disable MFA');
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
                        {hasExistingMfa ? 'Manage MFA' : 'Set Up Multi-Factor Authentication'}
                    </DialogTitle>
                    <DialogDescription>
                        {hasExistingMfa
                            ? 'Manage your authentication methods and backup codes.'
                            : 'Add an extra layer of security to your account.'}
                    </DialogDescription>
                </DialogHeader>

                {/* Method Selection */}
                {step === 'methods' && (
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Choose a method to secure your account:
                        </p>

                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={handleGenerateTOTP}
                            disabled={isLoading}
                        >
                            <div className="text-left">
                                <div className="font-medium items-center flex gap-2">
                                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                    Authenticator App (Recommended)
                                </div>
                                <div className="text-sm text-muted-foreground">
                                    Use Google Authenticator, Authy, or similar
                                </div>
                            </div>
                        </Button>
                    </div>
                )}

                {/* TOTP Setup */}
                {step === 'totp-setup' && (
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>1. Scan QR Code</Label>
                            <div className="flex justify-center p-4 border rounded-lg bg-white">
                                {qrCodeUrl ? (
                                    <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48" />
                                ) : (
                                    <div className="w-48 h-48 bg-muted flex items-center justify-center">
                                        Loading...
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Scan this QR code with your authenticator app.
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label>Or enter this code manually:</Label>
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
                            <Label htmlFor="verification-code">2. Enter Verification Code</Label>
                            <Input
                                id="verification-code"
                                placeholder="000000"
                                maxLength={6}
                                value={verificationCode}
                                onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                            />
                            <p className="text-sm text-muted-foreground">
                                Enter the 6-digit code from your authenticator app.
                            </p>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setStep('methods')}
                            >
                                Back
                            </Button>
                            <Button onClick={handleEnableTOTP} disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Enable MFA
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* Backup Codes */}
                {step === 'backup-codes' && (
                    <div className="space-y-4">
                        <Alert>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>Save Your Backup Codes</AlertTitle>
                            <AlertDescription>
                                Store these codes in a safe place. You can use them to access your
                                account if you lose your authenticator device.
                            </AlertDescription>
                        </Alert>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Backup Codes</Label>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={handleCopyBackupCodes}
                                >
                                    {copiedBackupCodes ? (
                                        <>
                                            <Check className="mr-2 h-4 w-4" />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="mr-2 h-4 w-4" />
                                            Copy All
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
                                Done
                            </Button>
                        </DialogFooter>
                    </div>
                )}

                {/* Manage MFA */}
                {step === 'manage' && (
                    <div className="space-y-4">
                        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-sm">
                            <div className="font-medium text-green-900 dark:text-green-100">
                                MFA is enabled
                            </div>
                            <div className="text-green-700 dark:text-green-300">
                                Your account is protected with two-factor authentication.
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => setStep('backup-codes')}
                            >
                                View Backup Codes
                            </Button>

                            {!isEnforced && (
                                <Button
                                    variant="destructive"
                                    className="w-full"
                                    onClick={handleDisableMFA}
                                    disabled={isLoading}
                                >
                                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Disable MFA
                                </Button>
                            )}

                            {isEnforced && (
                                <p className="text-sm text-muted-foreground text-center">
                                    MFA is required by your administrator and cannot be disabled.
                                </p>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
