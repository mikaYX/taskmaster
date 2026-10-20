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
import { Trans, useTranslation } from 'react-i18next';
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

/** Only SENT is a plain confirmation; the others tell the admin to hand the password over. */
const EMAIL_STATUS_OK: Record<CredentialsEmailStatus, boolean> = {
    SENT: true,
    FAILED: false,
    NOT_ACTIVE: false,
    NO_ADDRESS: false,
};

export function NewPasswordDialog({
    open,
    onOpenChange,
    password,
    username,
    title,
    emailStatus,
}: NewPasswordDialogProps) {
    const { t } = useTranslation();
    const emailMessage = emailStatus
        ? { text: t(`userMgmt.newPassword.emailStatus.${emailStatus}`), ok: EMAIL_STATUS_OK[emailStatus] }
        : null;

    const handleCopy = async () => {
        await navigator.clipboard.writeText(password);
        toast.success(t('userMgmt.newPassword.copied'));
    };

    const handleClose = () => {
        onOpenChange(false);
    };

    return (
        <AlertDialog open={open} onOpenChange={onOpenChange}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title ?? t('userMgmt.newPassword.title')}</AlertDialogTitle>
                    <AlertDialogDescription>
                        <Trans
                            i18nKey="userMgmt.newPassword.generatedFor"
                            values={{ username }}
                            components={{ strong: <strong /> }}
                        />
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
                            {t('userMgmt.newPassword.important')}
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
                        {t('userMgmt.newPassword.copy')}
                    </Button>
                    <AlertDialogAction onClick={handleClose} className="w-full sm:w-auto">
                        {t('userMgmt.newPassword.done')}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
