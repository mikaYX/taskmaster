import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/api/http';
import { useSetupStore } from '@/stores';
import { Shield, Eye, EyeOff, Mail } from 'lucide-react';
import { PASSWORD_RULES } from '@/lib/password-policy';

interface SecurityStepProps {
    onNext: () => void;
    onBack: () => void;
}

function getApiErrorMessage(error: ApiError): string | null {
    const data = error.data;

    if (!data || typeof data !== 'object') {
        return null;
    }

    const message = 'message' in data ? data.message : undefined;

    if (typeof message === 'string') {
        return message;
    }

    if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
        return message.join(' ');
    }

    return null;
}

/**
 * Security Step - Set admin identity.
 * Now uses Email as the primary identifier.
 */
export function SecurityStep({ onNext, onBack }: SecurityStepProps) {
    const { t } = useTranslation();
    const completeStep = useSetupStore((state) => state.completeStep);
    const initialPreferences = useSetupStore((state) => state.initialPreferences);

    // Form State
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // UI State
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const validateEmail = (email: string) => {
        return /\S+@\S+\.\S+/.test(email);
    };

    const handleSubmit = async () => {
        setError('');

        if (!email || !validateEmail(email)) {
            setError(t('setup.steps.admin.errors.invalidEmail'));
            return;
        }

        const missing = PASSWORD_RULES.filter((rule) => !rule.test(password));
        if (missing.length > 0) {
            setError(t('setup.steps.admin.errors.missing', {
                rules: missing.map((rule) => t(`setup.steps.admin.rules.${rule.key}`)).join(', '),
            }));
            return;
        }

        if (password !== confirmPassword) {
            setError(t('setup.steps.admin.errors.mismatch'));
            return;
        }

        setIsLoading(true);
        try {
            const { setupApi } = await import('@/api');
            // Use EMAIL as the username for the admin account
            const result = await setupApi.initialize({
                username: email,
                password,
                addonsTodolistEnabled: initialPreferences.todolistEnabled,
            });

            if (!result.success) {
                setError(result.message || t('setup.steps.admin.errors.createFailed'));
                return;
            }

            completeStep('admin');
            onNext();
            // Do not invalidate setup status here: refetch would set needsSetup=false and the wizard useEffect would redirect to /login before React commits currentStep=2. Status is refetched when the user finishes the wizard and lands on /login.
        } catch (err) {
            console.error('Setup error:', err);

            if (err instanceof ApiError) {
                const backendMessage = getApiErrorMessage(err);

                if (err.status === 409) {
                    setError(backendMessage || t('setup.steps.admin.errors.alreadyDone'));
                    window.location.href = '/login';
                    return;
                }

                if (err.status === 403 && !backendMessage) {
                    setError(t('setup.steps.admin.errors.bootstrapSecret'));
                    return;
                }

                setError(backendMessage || t('setup.steps.admin.errors.status', { status: err.status, statusText: err.statusText }));
                return;
            }

            setError(t('setup.steps.admin.errors.unexpected'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
                <Shield className="h-8 w-8" />
                <div>
                    <h3 className="font-semibold">{t('setup.steps.admin.title')}</h3>
                    <p className="text-sm text-muted-foreground">
                        {t('setup.steps.admin.subtitle')}
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Admin Email */}
                <div className="space-y-2">
                    <Label htmlFor="email">{t('setup.steps.admin.email')} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            placeholder={t('setup.steps.admin.emailPlaceholder')}
                            className="pl-9"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <p className="text-[0.8rem] text-muted-foreground">
                        {t('setup.steps.admin.emailHint')}
                    </p>
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <Label htmlFor="password">{t('setup.steps.admin.password')} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('setup.steps.admin.passwordPlaceholder')}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-0 top-0 h-full"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                    <p className="text-[0.8rem] text-muted-foreground">
                        {t('setup.steps.admin.passwordHint')}
                    </p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('setup.steps.admin.confirmPassword')} <span className="text-destructive">*</span></Label>
                    <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder={t('setup.steps.admin.confirmPlaceholder')}
                    />
                </div>

                {error && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                        {error}
                    </div>
                )}
            </div>

            <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={onBack}>{t('common.back')}</Button>
                <Button onClick={handleSubmit} disabled={isLoading} className="min-w-[100px]">
                    {isLoading ? t('setup.steps.admin.creating') : t('common.next')}
                </Button>
            </div>
        </div>
    );
}
