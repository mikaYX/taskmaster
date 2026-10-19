import { useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { useCredentialsEmailAvailable } from '@/hooks/use-users';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { CredentialsEmailStatus, User } from '@/api/types';
import { usersApi } from '@/api/users';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { NewPasswordDialog } from './new-password-dialog';

interface ResetPasswordDialogProps {
    user: User | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// Helper (duplicated for now, could be shared)
function generateRandomPassword(length = 12): string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let retVal = "";
    for (let i = 0, n = charset.length; i < length; ++i) {
        retVal += charset.charAt(Math.floor(Math.random() * n));
    }
    return retVal;
}

export function ResetPasswordDialog({ user, open, onOpenChange }: ResetPasswordDialogProps) {
    const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [sendEmail, setSendEmail] = useState(true);
    const [emailStatus, setEmailStatus] = useState<CredentialsEmailStatus | undefined>();

    const emailAvailability = useCredentialsEmailAvailable(open);
    const emailAvailable = emailAvailability.data?.available === true;
    const emailCheckDone = emailAvailability.isSuccess || emailAvailability.isError;

    const resetMutation = useMutation({
        mutationFn: ({ id, password, sendEmail }: { id: number; password: string; sendEmail: boolean }) =>
            usersApi.resetPassword(id, password, sendEmail || undefined),
        onSuccess: (result, variables) => {
            // Email unavailable: tell the admin to hand the password over directly.
            setEmailStatus(variables.sendEmail ? result.credentialsEmail : (emailAvailable ? undefined : 'NOT_ACTIVE'));
            // Do not close main dialog yet, switch to result
            setShowNewPassword(true);
            toast.success('Password reset successfully');
        },
        onError: () => {
            toast.error('Failed to reset password');
        },
    });

    const handleReset = () => {
        if (!user) return;
        const password = generateRandomPassword();
        setGeneratedPassword(password);
        resetMutation.mutate({ id: user.id, password, sendEmail: emailAvailable && sendEmail });
    };

    if (!user) return null;

    // If success, we show the result dialog instead
    if (showNewPassword && generatedPassword) {
        return (
            <NewPasswordDialog
                open={true}
                onOpenChange={(open) => {
                    if (!open) {
                        setShowNewPassword(false);
                        onOpenChange(false);
                    }
                }}
                password={generatedPassword}
                username={user.email || user.username}
                title="Password Reset Successful"
                emailStatus={emailStatus}
            />
        );
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Reset Password</DialogTitle>
                    <DialogDescription>
                        Are you sure you want to reset the password for <strong>{user.fullname || user.email || user.username}</strong>?
                        <br />
                        A new secure password will be generated automatically.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 bg-yellow-50 text-yellow-800 rounded-md p-3 text-sm border border-yellow-200">
                    ⚠️ The generated password will be shown <strong>only once</strong>.
                </div>

                {emailCheckDone && (
                    emailAvailable ? (
                        <label className="flex items-start gap-3 text-sm">
                            <Checkbox
                                checked={sendEmail}
                                onCheckedChange={(checked) => setSendEmail(checked === true)}
                                className="mt-0.5"
                            />
                            <span>
                                Send the temporary password to the user by email
                                <span className="block text-muted-foreground">
                                    The temporary password is still shown after the reset.
                                </span>
                            </span>
                        </label>
                    ) : (
                        <p role="note" className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                            Email sending is not active, so no email will be sent. After the reset, give the
                            temporary password to the user directly.
                        </p>
                    )
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        onClick={handleReset}
                        disabled={resetMutation.isPending}
                        variant="destructive"
                    >
                        {resetMutation.isPending ? 'Generating...' : 'Confirm & Generate New Password'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
