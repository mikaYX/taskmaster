import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
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
import { Check, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { authApi } from '@/api/auth';
import { getErrorMessage } from '@/api/http';
import { authKeys, useLogout } from '@/hooks/use-auth';
import { useAuthStore } from '@/stores';
import { PASSWORD_RULES, isStrongPassword } from '@/lib/password-policy';
import { cn } from '@/lib/utils';

interface ChangePasswordDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * Forced mode (first login / password reset by an admin): the dialog cannot
     * be dismissed, only completed or abandoned by signing out.
     */
    forced?: boolean;
}

export function ChangePasswordDialog({ open, onOpenChange, forced = false }: ChangePasswordDialogProps) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const logoutMutation = useLogout();
    const [isLoading, setIsLoading] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const reset = () => {
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const handleOpenChange = (next: boolean) => {
        if (forced && !next) return;
        onOpenChange(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!isStrongPassword(newPassword)) {
            toast.error(t('profile.changePassword.errors.weak'));
            return;
        }

        if (newPassword !== confirmPassword) {
            toast.error(t('profile.changePassword.errors.mismatch'));
            return;
        }

        setIsLoading(true);
        try {
            await authApi.changePassword({ currentPassword, password: newPassword });

            useAuthStore.setState({ mustChangePassword: false });
            await queryClient.invalidateQueries({ queryKey: authKeys.session });

            toast.success(t('profile.changePassword.success'));
            reset();
            onOpenChange(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('profile.changePassword.errors.failed')));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent
                showCloseButton={!forced}
                onInteractOutside={(e) => forced && e.preventDefault()}
                onEscapeKeyDown={(e) => forced && e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle>
                        {forced ? t('profile.changePassword.forcedTitle') : t('profile.changePassword.title')}
                    </DialogTitle>
                    <DialogDescription>
                        {forced ? t('profile.changePassword.forcedDescription') : t('profile.changePassword.description')}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="current-password">{t('profile.changePassword.current')}</Label>
                        <Input
                            id="current-password"
                            type="password"
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="new-password">{t('profile.changePassword.new')}</Label>
                        <Input
                            id="new-password"
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                        <ul className="space-y-1 text-sm" aria-live="polite">
                            {PASSWORD_RULES.map((rule) => {
                                const ok = rule.test(newPassword);
                                return (
                                    <li
                                        key={rule.key}
                                        className={cn(
                                            'flex items-center gap-2',
                                            ok ? 'text-green-600' : 'text-muted-foreground',
                                        )}
                                    >
                                        {ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                                        {t(`profile.changePassword.rules.${rule.key}`)}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirm-password">{t('profile.changePassword.confirm')}</Label>
                        <Input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            required
                            autoComplete="new-password"
                        />
                    </div>

                    <DialogFooter>
                        {forced ? (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => logoutMutation.mutate()}
                                disabled={isLoading}
                            >
                                {t('auth.signOut')}
                            </Button>
                        ) : (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => onOpenChange(false)}
                                disabled={isLoading}
                            >
                                {t('profile.changePassword.cancel')}
                            </Button>
                        )}
                        <Button type="submit" disabled={isLoading}>
                            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {t('profile.changePassword.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
