import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useSetupStore } from '@/stores';
import { AlertTriangle, CheckCircle2, Circle, PartyPopper, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SetupStepLayout } from './setup-step-layout';

interface SummaryStepProps {
    onComplete: () => void;
    onBack: () => void;
}

/**
 * Summary Step - Review and complete setup.
 */
export function SummaryStep({ onComplete, onBack }: SummaryStepProps) {
    const { t } = useTranslation();
    const { adminPasswordSet, preferencesSet } = useSetupStore();

    const items = [
        { label: t('setup.steps.summaryItems.admin'), completed: adminPasswordSet },
        { label: t('setup.steps.summary.preferencesSet'), completed: preferencesSet },
    ];

    const requiredComplete = adminPasswordSet && preferencesSet;

    return (
        <SetupStepLayout
            icon={Rocket}
            title={t('setup.complete')}
            subtitle={t('setup.reviewConfig')}
            actions={
                <>
                    <Button variant="outline" onClick={onBack}>{t('common.back')}</Button>
                    <Button onClick={onComplete} disabled={!requiredComplete} className="min-w-[120px]">
                        {t('setup.completeSetup')}
                    </Button>
                </>
            }
        >
            <ul className="space-y-3">
                {items.map((item) => (
                    <li
                        key={item.label}
                        className={cn(
                            'flex items-center gap-3 rounded-xl border p-4',
                            item.completed && 'border-emerald-500/30 bg-emerald-500/5',
                        )}
                    >
                        {item.completed ? (
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                            <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                        )}
                        <span className={cn('text-sm font-medium', !item.completed && 'text-muted-foreground')}>
                            {item.label}
                        </span>
                    </li>
                ))}
            </ul>

            <div
                className={cn(
                    'flex items-start gap-3 rounded-xl p-4 text-sm',
                    requiredComplete
                        ? 'bg-primary/5 text-foreground'
                        : 'bg-amber-500/10 text-amber-900 dark:text-amber-200',
                )}
            >
                {requiredComplete ? (
                    <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                ) : (
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                )}
                <p>{requiredComplete ? t('setup.allConfigured') : t('setup.someMissing')}</p>
            </div>
        </SetupStepLayout>
    );
}
