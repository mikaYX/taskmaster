import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSetupStore } from '@/stores';
import { Settings } from 'lucide-react';

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
    const [language, setLanguage] = useState(i18n.language?.split('-')[0] || 'en');
    const [timezone, setTimezone] = useState('Europe/Paris');
    const [todolistEnabled, setTodolistEnabled] = useState(initialPreferences.todolistEnabled);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const code = i18n.language?.split('-')[0] || 'en';
        setLanguage(code === 'fr' ? 'fr' : 'en');
    }, [i18n.language]);

    const handleLanguageChange = (value: string) => {
        setLanguage(value);
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
        <div className="space-y-6">
            <div className="flex items-center gap-3 text-primary">
                <Settings className="h-8 w-8" />
                <div>
                    <h3 className="font-semibold">Application Preferences</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure default application settings
                    </p>
                </div>
            </div>

            <div className="space-y-4">
                <div className="space-y-2">
                    <Label>Language / Langue</Label>
                    <Select value={language} onValueChange={handleLanguageChange}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {LANGUAGES.map(({ value, label }) => (
                                <SelectItem key={value} value={value}>
                                    {label}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <p className="text-[0.8rem] text-muted-foreground">
                        The interface language updates immediately.
                    </p>
                </div>

                <div className="space-y-2">
                    <Label>Default Timezone</Label>
                    <Select value={timezone} onValueChange={setTimezone}>
                        <SelectTrigger>
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

                <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                        <p className="font-medium">{t('settings.todoListEnabled')}</p>
                        <p className="text-sm text-muted-foreground">
                            {t('settings.todoListHint')}
                        </p>
                    </div>
                    <Switch checked={todolistEnabled} onCheckedChange={setTodolistEnabled} />
                </div>

            </div>

            <div className="flex justify-between">
                {!isFirstStep ? (
                    <Button variant="outline" onClick={onBack}>Back</Button>
                ) : (
                    <div />
                )}
                <Button onClick={handleNext} disabled={isLoading}>
                    {isLoading ? 'Saving...' : 'Next'}
                </Button>
            </div>
        </div>
    );
}
