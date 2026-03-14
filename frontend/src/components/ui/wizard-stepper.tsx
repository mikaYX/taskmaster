import { cn } from '@/lib/utils';
import { useMemo } from 'react';

/**
 * Interface for a Wizard Step
 */
export interface Step {
    id: number;
    name: string;
    description?: string;
}

interface WizardStepperProps {
    steps: readonly Step[];
    currentStep: number;
    className?: string;
}

/**
 * WizardStepper
 * 
 * A modern, continuous stepper component for the onboarding wizard.
 * Displays a progress line with nodes for each step.
 */
export function WizardStepper({ steps, currentStep, className }: WizardStepperProps) {
    const progressPercentage = useMemo(() => {
        if (steps.length <= 1) return 0;
        // Calculate percentage to fill the line up to the current step's status
        // If we are at step 1, 0%
        // If we are at step N, 100%
        return Math.min(100, Math.max(0, ((currentStep - 1) / (steps.length - 1)) * 100));
    }, [steps.length, currentStep]);

    return (
        <div className={cn("relative w-full py-4", className)}>
            {/* Background Line */}
            <div className="absolute top-1/2 left-0 h-0.5 w-full -translate-y-1/2 bg-muted" aria-hidden="true" />

            {/* Active Progress Line */}
            <div
                className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-primary transition-all duration-300 ease-in-out"
                style={{ width: `${progressPercentage}%` }}
                aria-hidden="true"
            />

            {/* Steps Nodes */}
            <div className="relative flex justify-between w-full">
                {steps.map((step) => {
                    const isActive = step.id === currentStep;
                    const isCompleted = step.id < currentStep;


                    return (
                        <div key={step.id} className="flex flex-col items-center group">
                            {/* Dot / Node */}
                            <div
                                className={cn(
                                    "relative z-10 flex items-center justify-center transition-all duration-300",
                                    // Base sizing
                                    isActive ? "h-5 w-5" : "h-4 w-4",
                                    // Colors and background
                                    isCompleted ? "bg-emerald-400 border-emerald-400" :
                                        isActive ? "bg-primary border-primary ring-4 ring-primary/20" :
                                            "bg-background border-2 border-muted-foreground",
                                    // Shape
                                    "rounded-full border"
                                )}
                            >
                                {/* Active Inner Dot (optional visual enhancement) */}
                                {isActive && (
                                    <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />
                                )}
                            </div>

                            {/* Label */}
                            <div className={cn(
                                "absolute top-6 flex flex-col items-center text-center w-32 transition-colors duration-300",
                                isActive ? "text-foreground font-medium scale-105" :
                                    isCompleted ? "text-muted-foreground" : "text-muted-foreground/70"
                            )}>
                                <span className="text-xs">{step.name}</span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
