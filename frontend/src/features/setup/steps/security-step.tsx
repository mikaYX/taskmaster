import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/api/http';
import { useSetupStore } from '@/stores';
import { AlertCircle, Check, Eye, EyeOff, Lock, Mail, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SetupStepLayout } from './setup-step-layout';
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

    const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password;

    return (
        <SetupStepLayout
            icon={Shield}
            title={t('setup.steps.admin.title')}
            subtitle={t('setup.steps.admin.subtitle')}
            actions={
                <>
                    <Button variant="outline" onClick={onBack}>{t('common.back')}</Button>
                    <Button onClick={handleSubmit} disabled={isLoading} className="min-w-[120px]">
                        {isLoading ? t('setup.steps.admin.creating') : t('common.next')}
                    </Button>
                </>
            }
        >
            <form
                className="space-y-5"
                onSubmit={(e) => {
                    e.preventDefault();
                    void handleSubmit();
                }}
            >
                {/* Admin Email */}
                <div className="space-y-2">
                    <Label htmlFor="email">{t('setup.steps.admin.email')} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            autoComplete="username"
                            placeholder={t('setup.steps.admin.emailPlaceholder')}
                            className="h-11 rounded-xl pl-10"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">{t('setup.steps.admin.emailHint')}</p>
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <Label htmlFor="password">{t('setup.steps.admin.password')} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            className="h-11 rounded-xl pl-10 pr-11"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder={t('setup.steps.admin.passwordPlaceholder')}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 h-9 w-9 -translate-y-1/2 rounded-lg"
                            onClick={() => setShowPassword(!showPassword)}
                            aria-label={showPassword ? t('setup.steps.admin.hidePassword') : t('setup.steps.admin.showPassword')}
                        >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                    </div>
                    <ul className="grid gap-1.5 pt-1 sm:grid-cols-2" aria-live="polite">
                        {PASSWORD_RULES.map((rule) => {
                            const ok = rule.test(password);
                            return (
                                <li
                                    key={rule.key}
                                    className={cn(
                                        'flex items-start gap-2 text-xs transition-colors',
                                        ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground',
                                    )}
                                >
                                    <span
                                        className={cn(
                                            'mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                                            ok ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-muted-foreground/40',
                                        )}
                                    >
                                        {ok && <Check className="h-3 w-3" />}
                                    </span>
                                    {t(`setup.steps.admin.rules.${rule.key}`)}
                                </li>
                            );
                        })}
                    </ul>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t('setup.steps.admin.confirmPassword')} <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="confirmPassword"
                            type="password"
                            autoComplete="new-password"
                            className={cn('h-11 rounded-xl pl-10', confirmMismatch && 'border-destructive focus-visible:ring-destructive')}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder={t('setup.steps.admin.confirmPlaceholder')}
                            aria-invalid={confirmMismatch}
                        />
                    </div>
                    {confirmMismatch && (
                        <p className="text-xs text-destructive">{t('setup.steps.admin.errors.mismatch')}</p>
                    )}
                </div>

                {error && (
                    <div className="flex items-start gap-2.5 rounded-xl border border-destructive/20 bg-destructive/10 p-3.5 text-sm text-destructive" role="alert">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* Lets Enter submit the form */}
                <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
            </form>
        </SetupStepLayout>
    );
}
