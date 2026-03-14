import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetupStore } from '@/stores';
import { Shield, Eye, EyeOff, Mail } from 'lucide-react';

interface SecurityStepProps {
    onNext: () => void;
    onBack: () => void;
}

/**
 * Security Step - Set admin identity.
 * Now uses Email as the primary identifier.
 */
export function SecurityStep({ onNext, onBack }: SecurityStepProps) {
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
            setError('Please enter a valid email address');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        if (password !== confirmPassword) {
            setError('Passwords do not match');
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
                setError(result.message || 'Failed to create admin');
                return;
            }

            completeStep('admin');
            onNext();
            // Do not invalidate setup status here: refetch would set needsSetup=false and the wizard useEffect would redirect to /login before React commits currentStep=2. Status is refetched when the user finishes the wizard and lands on /login.
        } catch (err) {
            console.error('Setup error:', err);
            setError('Failed to create account - is the backend running?');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
                <Shield className="h-8 w-8" />
                <div>
                    <h3 className="font-semibold">Administrator Account</h3>
                    <p className="text-sm text-muted-foreground">
                        Create the primary administrator identity.
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                {/* Admin Email */}
                <div className="space-y-2">
                    <Label htmlFor="email">Admin Email <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            id="email"
                            type="email"
                            placeholder="admin@example.com"
                            className="pl-9"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <p className="text-[0.8rem] text-muted-foreground">
                        This email will be used as the primary administrator account and login.
                    </p>
                </div>

                {/* Password */}
                <div className="space-y-2">
                    <Label htmlFor="password">Password <span className="text-destructive">*</span></Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Strong password (min 8 chars)"
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
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirm Password <span className="text-destructive">*</span></Label>
                    <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Re-enter password"
                    />
                </div>

                {error && (
                    <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                        {error}
                    </div>
                )}
            </div>

            <div className="flex justify-between pt-4">
                <Button variant="outline" onClick={onBack}>Back</Button>
                <Button onClick={handleSubmit} disabled={isLoading} className="min-w-[100px]">
                    {isLoading ? 'Creating...' : 'Next'}
                </Button>
            </div>
        </div>
    );
}
