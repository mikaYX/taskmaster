import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ClipboardCheck } from 'lucide-react';
import { useSetupStatus } from '@/hooks';
import { cn } from '@/lib/utils';
import { useSetupStore, SETUP_STEPS } from '@/stores';
import { SecurityStep } from './steps/security-step';
import { PreferencesStep } from './steps/preferences-step';
import { SummaryStep } from './steps/summary-step';

/**
 * Setup Wizard.
 *
 * Multi-step onboarding wizard for first-time setup.
 * html/body/#root do not scroll, so this page owns its own scroll container:
 * on short screens the form scrolls and the step actions stay pinned at the bottom.
 */

const STEP_KEYS = ['preferences', 'admin', 'summary'] as const;

export function SetupWizard() {
    const { t } = useTranslation();
    const steps = SETUP_STEPS.map((step, index) => ({
        id: step.id,
        name: t(`setup.steps.${STEP_KEYS[index]}.name`),
        description: t(`setup.steps.${STEP_KEYS[index]}.description`),
    }));
    const { currentStep, nextStep, prevStep, completeSetup, adminPasswordSet } = useSetupStore();
    const { data: status, isLoading } = useSetupStatus();

    // Redirect to login only when setup is already complete elsewhere (e.g. another tab created admin).
    // Do NOT reset when status.needsSetup && currentStep > 1: after creating the admin we go to step 2 but we don't refetch status, so status still says needsSetup — resetting would send the user back to step 1.
    useEffect(() => {
        if (!isLoading && !status?.needsSetup && currentStep === 1 && !adminPasswordSet) {
            window.location.href = '/login';
        }
    }, [isLoading, status?.needsSetup, currentStep, adminPasswordSet]);

    const handleComplete = () => {
        completeSetup();
        // The guard will re-check and find setup is done (because admin exists)
        window.location.href = '/login';
    };

    const renderStep = () => {
        switch (currentStep) {
            case 1:
                return <PreferencesStep onNext={nextStep} onBack={prevStep} isFirstStep />;
            case 2:
                return <SecurityStep onNext={nextStep} onBack={prevStep} />;
            case 3:
                return <SummaryStep onComplete={handleComplete} onBack={prevStep} />;
            default:
                return null;
        }
    };

    const progress = (currentStep / steps.length) * 100;

    return (
        <div className="h-full overflow-y-auto bg-muted/40">
            <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col lg:flex-row lg:items-stretch lg:gap-8 lg:p-8">
                {/* Brand + steps panel (large screens) */}
                <aside className="relative hidden w-[340px] shrink-0 flex-col overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-primary/80 p-8 text-primary-foreground shadow-xl shadow-primary/20 lg:flex">
                    <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" aria-hidden="true" />
                    <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-white/5 blur-2xl" aria-hidden="true" />

                    <div className="relative flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
                            <ClipboardCheck className="h-6 w-6" />
                        </div>
                        <span className="text-xl font-bold tracking-tight">Taskmaster</span>
                    </div>

                    <div className="relative mt-10">
                        <h1 className="text-2xl font-semibold leading-tight">{t('setup.title')}</h1>
                        <p className="mt-2 text-sm text-primary-foreground/75">{t('setup.brandTagline')}</p>
                    </div>

                    <ol className="relative mt-10 space-y-1">
                        {steps.map((step, index) => {
                            const isActive = step.id === currentStep;
                            const isDone = step.id < currentStep;
                            return (
                                <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
                                    {index < steps.length - 1 && (
                                        <span
                                            className={cn(
                                                'absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px',
                                                isDone ? 'bg-white/70' : 'bg-white/20',
                                            )}
                                            aria-hidden="true"
                                        />
                                    )}
                                    <span
                                        className={cn(
                                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors',
                                            isDone && 'bg-white text-primary',
                                            isActive && 'bg-white text-primary ring-4 ring-white/25',
                                            !isDone && !isActive && 'bg-white/10 text-primary-foreground/70 ring-1 ring-white/25',
                                        )}
                                        aria-current={isActive ? 'step' : undefined}
                                    >
                                        {isDone ? <Check className="h-4 w-4" /> : step.id}
                                    </span>
                                    <div className="pt-1">
                                        <p className={cn('text-sm font-medium', !isActive && !isDone && 'text-primary-foreground/70')}>
                                            {step.name}
                                        </p>
                                        <p className="text-xs text-primary-foreground/60">{step.description}</p>
                                    </div>
                                </li>
                            );
                        })}
                    </ol>

                    <p className="relative mt-auto pt-10 text-xs text-primary-foreground/60">
                        {t('setup.stepOf', { current: currentStep, total: steps.length })}
                    </p>
                </aside>

                {/* Compact header (small screens) */}
                <header className="border-b bg-background px-4 pb-4 pt-5 sm:px-6 lg:hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
                                <ClipboardCheck className="h-5 w-5" />
                            </div>
                            <span className="font-bold tracking-tight">Taskmaster</span>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground">
                            {t('setup.stepOf', { current: currentStep, total: steps.length })}
                        </span>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                    <p className="mt-2 text-sm font-medium">{steps[currentStep - 1]?.name}</p>
                </header>

                {/* Step content */}
                <main className="flex flex-1 flex-col bg-background lg:rounded-3xl lg:border lg:shadow-sm">
                    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-6 sm:px-6 sm:pt-8 lg:pt-12">
                        {renderStep()}
                    </div>
                </main>
            </div>
        </div>
    );
}
