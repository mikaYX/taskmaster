import { useEffect } from 'react';
import { useSetupStatus } from '@/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { WizardStepper } from '@/components/ui/wizard-stepper';
import { useSetupStore, SETUP_STEPS } from '@/stores';
import { SecurityStep } from './steps/security-step';
import { PreferencesStep } from './steps/preferences-step';
import { SummaryStep } from './steps/summary-step';

/**
 * Setup Wizard.
 * 
 * Multi-step onboarding wizard for first-time setup.
 * shadcn/ui Card, Progress, Button.
 */

export function SetupWizard() {
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
        // Force reload SetupGuard status by invalidating query or just redirect
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

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4">
            <Card className="w-full max-w-3xl">
                <CardHeader>
                    <div className="flex items-center justify-between mb-4">
                        <CardTitle className="text-2xl">Setup Wizard</CardTitle>
                        <span className="text-sm text-muted-foreground">
                            Step {currentStep} of {SETUP_STEPS.length}
                        </span>
                    </div>
                    {/* Modern Stepper */}
                    <div className="px-10 mt-2 mb-6">
                        <WizardStepper steps={SETUP_STEPS} currentStep={currentStep} />
                    </div>

                    <CardDescription className="mt-4">
                        {SETUP_STEPS[currentStep - 1]?.description}
                    </CardDescription>
                </CardHeader>

                <CardContent>
                    {renderStep()}
                </CardContent>
            </Card>
        </div>
    );
}
