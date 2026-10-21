import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSetupStore } from '@/stores';
import { Check, Globe2, ListTodo, Settings } from 'lucide-react';
import { SetupStepLayout } from './setup-step-layout';

const LANGUAGES = [
    { value: 'en', label: 'English' },
    { value: 'fr', label: 'Français' },
] as const;

interface PreferencesStepProps {
    onNext: () => void;
    onBack: () => void;
    isFirstStep?: boolean;
}

/**
 * Preferences Step - Application preferences (language, timezone, etc.).
 */
export function PreferencesStep({ onNext, onBack, isFirstStep }: PreferencesStepProps) {
    const { t, i18n } = useTranslation();
    const completeStep = useSetupStore((state) => state.completeStep);
    const initialPreferences = useSetupStore((state) => state.initialPreferences);
    // Derived directly from i18n.language during render — useTranslation() already
    // re-renders this component whenever the active language changes, so no local
    // state/effect is needed to keep it in sync.
    const language = i18n.language?.split('-')[0] === 'fr' ? 'fr' : 'en';
    const [timezone, setTimezone] = useState('Europe/Paris');
    const [todolistEnabled, setTodolistEnabled] = useState(initialPreferences.todolistEnabled);
    const [isLoading, setIsLoading] = useState(false);

    const handleLanguageChange = (value: string) => {
        i18n.changeLanguage(value);
    };

    const setInitialPreferences = useSetupStore((state) => state.setInitialPreferences);

    const handleNext = async () => {
        setIsLoading(true);
        try {
            setInitialPreferences({ todolistEnabled: todolistEnabled });
            await new Promise((resolve) => setTimeout(resolve, 300));
            completeStep('preferences');
            onNext();
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <SetupStepLayout
            icon={Settings}
            title={t('setup.steps.preferences.title')}
            subtitle={t('setup.steps.preferences.subtitle')}
            actions={
                <>
                    {!isFirstStep ? (
                        <Button variant="outline" onClick={onBack}>{t('common.back')}</Button>
                    ) : (
                        <div />
                    )}
                    <Button onClick={handleNext} disabled={isLoading} className="min-w-[120px]">
                        {isLoading ? t('common.saving') : t('common.next')}
                    </Button>
                </>
            }
        >
            <div className="space-y-2.5">
                <Label>{t('setup.languageLabel')}</Label>
                <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={t('setup.languageLabel')}>
                    {LANGUAGES.map(({ value, label }) => {
                        const selected = language === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => handleLanguageChange(value)}
                                className={cn(
                                    'relative flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-medium transition-all',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                                    selected
                                        ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                        : 'hover:border-primary/40 hover:bg-muted/50',
                                )}
                            >
                                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-xs font-bold uppercase text-muted-foreground">
                                    {value}
                                </span>
                                {label}
                                {selected && <Check className="absolute right-3 h-4 w-4 text-primary" />}
                            </button>
                        );
                    })}
                </div>
                <p className="text-xs text-muted-foreground">{t('setup.languageHint')}</p>
            </div>

            <div className="space-y-2.5">
                <Label className="flex items-center gap-2">
                    <Globe2 className="h-4 w-4 text-muted-foreground" />
                    {t('setup.steps.preferences.timezone')}
                </Label>
                <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="h-11 w-full rounded-xl">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="Europe/Paris">Europe/Paris</SelectItem>
                        <SelectItem value="Europe/London">Europe/London</SelectItem>
                        <SelectItem value="America/New_York">America/New_York</SelectItem>
                        <SelectItem value="America/Los_Angeles">America/Los_Angeles</SelectItem>
                        <SelectItem value="Asia/Tokyo">Asia/Tokyo</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <label className="flex cursor-pointer items-center gap-4 rounded-xl border p-4 transition-colors hover:bg-muted/40">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <ListTodo className="h-5 w-5" />
                </span>
                <span className="flex-1">
                    <span className="block font-medium">{t('settings.todoListEnabled')}</span>
                    <span className="block text-sm text-muted-foreground">{t('settings.todoListHint')}</span>
                </span>
                <Switch checked={todolistEnabled} onCheckedChange={setTodolistEnabled} />
            </label>
        </SetupStepLayout>
    );
}
