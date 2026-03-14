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

interface NewPasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    password: string;
    username: string;
    title?: string;
}

export function NewPasswordDialog({
    open,
    onOpenChange,
    password,
    username,
    title = "New Password Generated"
}: NewPasswordDialogProps) {
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
