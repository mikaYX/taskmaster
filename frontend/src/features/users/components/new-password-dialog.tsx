import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import type { CredentialsEmailStatus } from '@/api/types';

interface NewPasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    password: string;
    username: string;
    title?: string;
    /** Result of emailing the credentials; omit when no email was requested. */
    emailStatus?: CredentialsEmailStatus;
}

const EMAIL_STATUS_MESSAGES: Record<CredentialsEmailStatus, { text: string; ok: boolean }> = {
    SENT: { text: 'The credentials were also sent to the user by email.', ok: true },
    FAILED: { text: 'The email could not be sent. Give the temporary password to the user directly.', ok: false },
    NOT_ACTIVE: { text: 'Email sending is not active, so nothing was sent. Give the temporary password to the user directly.', ok: false },
    NO_ADDRESS: { text: 'This account has no email address, so nothing was sent. Give the temporary password to the user directly.', ok: false },
};

export function NewPasswordDialog({
    open,
    onOpenChange,
    password,
    username,
    title = "New Password Generated",
    emailStatus,
}: NewPasswordDialogProps) {
    const emailMessage = emailStatus ? EMAIL_STATUS_MESSAGES[emailStatus] : null;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(password);
        toast.success("Password copied to clipboard");
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>
                        A new password has been generated for <strong>{username}</strong>.
                        <br /><br />
                        <span className="block p-4 bg-muted rounded-md font-mono text-center text-lg select-all border border-input">
                            {password}
                        </span>
                        <br />
                        {emailMessage && (
                            <span
                                role="status"
                                className={`block mb-2 font-medium ${emailMessage.ok ? 'text-foreground' : 'text-amber-600 dark:text-amber-400'}`}
                            >
                                {emailMessage.text}
                            </span>
                        )}
                        <span className="text-destructive font-medium block">
                            ⚠️ Important: Copy this password now. It will not be shown again.
                        </span>
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="sm:justify-between">
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={handleCopy}
                        className="w-full sm:w-auto"
                    >
                        <Copy className="mr-2 h-4 w-4" />
                        Copy to Clipboard
                    </Button>
                    <AlertDialogAction onClick={handleClose} className="w-full sm:w-auto">
                        I have copied it
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
