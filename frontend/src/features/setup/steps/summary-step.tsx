import { Button } from '@/components/ui/button';
import { useSetupStore } from '@/stores';
import { CheckCircle, XCircle, Rocket } from 'lucide-react';

interface SummaryStepProps {
    onComplete: () => void;
    onBack: () => void;
}

/**
 * Summary Step - Review and complete setup.
 */
export function SummaryStep({ onComplete, onBack }: SummaryStepProps) {
    const { adminPasswordSet, preferencesSet } = useSetupStore();

    const items = [
        { label: 'Administrator account created', completed: adminPasswordSet },
        { label: 'Application preferences set', completed: preferencesSet },
    ];

    const requiredComplete = adminPasswordSet && preferencesSet;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
                <Rocket className="h-8 w-8" />
                <div>
                    <h3 className="font-semibold">Setup Complete!</h3>
                    <p className="text-sm text-muted-foreground">
                        Review your configuration before finishing
                    </p>
                </div>
            </div>

            <div className="space-y-3">
                {items.map((item) => (
                    <div
                        key={item.label}
                        className="flex items-center justify-between p-3 border rounded-lg"
                    >
                        <div className="flex items-center gap-3">
                            {item.completed ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                            ) : (
                                <XCircle className="h-5 w-5 text-muted-foreground" />
                            )}
                            <span className={item.completed ? '' : 'text-muted-foreground'}>
                                {item.label}
                            </span>
                        </div>

                    </div>
                ))}
            </div>

            <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm">
                    {requiredComplete
                        ? '✅ All required settings are configured. You can now start using Taskmaster!'
                        : '⚠️ Some required settings are missing. Please go back and complete them.'}
                </p>
            </div>

            <div className="flex justify-between">
                <Button variant="outline" onClick={onBack}>Back</Button>
                <Button onClick={onComplete} disabled={!requiredComplete}>
                    Complete Setup
                </Button>
            </div>
        </div>
    );
}
