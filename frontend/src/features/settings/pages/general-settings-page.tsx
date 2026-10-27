import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, SETTINGS_SAVED_TOAST_ID } from '../hooks/use-settings';
import { useHolidays } from '@/hooks/use-holidays';
import { useSites } from '@/hooks/use-sites';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Loader2, ChevronLeft, ChevronRight, Calendar, ChevronDown, Globe, Clock, Puzzle } from 'lucide-react';
import { SettingsSection } from '../components/settings-section';
import { toast } from 'sonner';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from '@/components/ui/collapsible';

const WEEK_START_BY_COUNTRY: Record<string, 'monday' | 'sunday'> = {
    FR: 'monday',
    US: 'sunday',
    GB: 'monday',
    DE: 'monday',
    ES: 'monday',
};


export function GeneralSettingsPage() {
    const { t, i18n } = useTranslation();
    const { settings, getSetting, getSettingAsBool, updateSetting, isLoading } = useSettings();

    // Auto-save settings
    const [language, setLanguage] = useState('en');
    const [country, setCountry] = useState('FR');

    // Scheduling Defaults
    const [defaultStartTime, setDefaultStartTime] = useState('08:00');
    const [defaultEndTime, setDefaultEndTime] = useState('18:00');

    // Holidays preview
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showHolidays, setShowHolidays] = useState(false);
    // The preview can show a site's own calendar; the global country stays the default.
    const { data: sites = [] } = useSites();
    const sitesWithCountry = sites.filter((s) => s.country);
    const [previewSiteId, setPreviewSiteId] = useState<string>('global');
    const previewCountry = sitesWithCountry.find((s) => String(s.id) === previewSiteId)?.country ?? country;
    const { data: holidaysData, isLoading: holidaysLoading, error: holidaysError } = useHolidays(previewCountry, selectedYear, showHolidays);

    const isInitialized = useRef(false);
    const calendarLocale = i18n.resolvedLanguage?.startsWith('fr') ? 'fr-FR' : 'en-GB';

    const getCountryLabel = (countryCode: string) => t(`generalSettings.countries.${countryCode}`);
    const getHolidaySourceLabel = (countryCode: string) => t(`generalSettings.holidaySources.${countryCode}`);

    // Load settings only once
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            const lang = getSetting('ui.language') || 'en';
            const ctr = getSetting('app.country') || 'FR';
            const defaultStart = getSetting('SCHEDULE_DEFAULT_START_TIME') || '08:00';
            const defaultEnd = getSetting('SCHEDULE_DEFAULT_END_TIME') || '18:00';

            // Wrap initialisation in setTimeout to avoid cascading render warning
            setTimeout(() => {
                setLanguage(lang);
                setCountry(ctr);
                setDefaultStartTime(defaultStart);
                setDefaultEndTime(defaultEnd);
            }, 0);
            isInitialized.current = true;
        }
    }, [getSetting, settings.length]);

    // Auto-save handlers
    const handleLanguageChange = (newLang: string) => {
        setLanguage(newLang);
        updateSetting({ key: 'ui.language', value: newLang }, { silent: true });
        i18n.changeLanguage(newLang.toLowerCase());
        toast.success(t('generalSettings.languageUpdated'), { id: SETTINGS_SAVED_TOAST_ID });
    };

    // Sites without their own country follow this setting, so changing it moves
    // their holidays: ask for confirmation before saving.
    const inheritingSites = sites.filter((s) => !s.country);
    const [pendingCountry, setPendingCountry] = useState<string | null>(null);

    const applyCountry = (newCountry: string) => {
        setCountry(newCountry);
        updateSetting({ key: 'app.country', value: newCountry }, { silent: true });
        toast.success(t('generalSettings.countryUpdated'), { id: SETTINGS_SAVED_TOAST_ID });
    };

    const handleCountryChange = (newCountry: string) => {
        if (newCountry === country) return;
        if (inheritingSites.length > 0) {
            setPendingCountry(newCountry);
        } else {
            applyCountry(newCountry);
        }
    };

    const handleDefaultStartTimeChange = (time: string) => {
        setDefaultStartTime(time);
        if (time && time < defaultEndTime) {
            updateSetting({ key: 'SCHEDULE_DEFAULT_START_TIME', value: time });
            // toast.success('Default start time updated'); // Handled organically to prevent toast spam
        } else if (time >= defaultEndTime) {
            toast.error(t('generalSettings.startTimeBeforeEnd'));
        }
    };

    const handleDefaultEndTimeChange = (time: string) => {
        setDefaultEndTime(time);
        if (time && defaultStartTime < time) {
            updateSetting({ key: 'SCHEDULE_DEFAULT_END_TIME', value: time });
        } else if (defaultStartTime >= time) {
            toast.error(t('generalSettings.endTimeAfterStart'));
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <AlertDialog open={pendingCountry !== null} onOpenChange={(open) => { if (!open) setPendingCountry(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('generalSettings.countryChangeTitle')}</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                <p>
                                    {t('generalSettings.countryChangeDescription', {
                                        from: getCountryLabel(country),
                                        to: pendingCountry ? getCountryLabel(pendingCountry) : '',
                                    })}
                                </p>
                                <ul className="list-disc pl-5">
                                    {inheritingSites.map((s) => (
                                        <li key={s.id}>{s.name}</li>
                                    ))}
                                </ul>
                                <p>{t('generalSettings.countryChangeHint')}</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                if (pendingCountry) applyCountry(pendingCountry);
                                setPendingCountry(null);
                            }}
                        >
                            {t('generalSettings.countryChangeConfirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* LANGUAGE & REGION */}
            <SettingsSection title={t('generalSettings.languageAndRegion')} description={t('generalSettings.languageAndRegionDescription')} icon={Globe}>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label htmlFor="language">{t('generalSettings.language')}</Label>
                        <Select value={language} onValueChange={handleLanguageChange}>
                            <SelectTrigger id="language">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="en">{t('generalSettings.languages.en')}</SelectItem>
                                <SelectItem value="fr">Français</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {t('generalSettings.languageAutoSave')}
                        </p>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="country">{t('generalSettings.countryRegion')}</Label>
                        <Select value={country} onValueChange={handleCountryChange}>
                            <SelectTrigger id="country">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="FR">{t('generalSettings.countries.FR')}</SelectItem>
                                <SelectItem value="US">{t('generalSettings.countries.US')}</SelectItem>
                                <SelectItem value="GB">{t('generalSettings.countries.GB')}</SelectItem>
                                <SelectItem value="DE">{t('generalSettings.countries.DE')}</SelectItem>
                                <SelectItem value="ES">{t('generalSettings.countries.ES')}</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            {t('generalSettings.countryRegionDescription')}
                        </p>
                    </div>
                </div>

                {/* Derived Rules */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium">{t('generalSettings.derivedRules')}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="rounded-lg border bg-muted/50 p-4">
                            <div className="text-xs text-muted-foreground mb-1">{t('generalSettings.weekStartsOn')}</div>
                            <div className="font-medium">
                                {t(`generalSettings.weekdays.${WEEK_START_BY_COUNTRY[country] || 'monday'}`)} ({country})
                            </div>
                        </div>

                        <div className="rounded-lg border bg-muted/50 p-4">
                            <div className="text-xs text-muted-foreground mb-1">{t('generalSettings.publicHolidaysSource')}</div>
                            <div className="font-medium">
                                {getHolidaySourceLabel(country)}
                            </div>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t('generalSettings.derivedRulesDescription')}
                    </p>
                </div>

                {/* Public Holidays Preview */}
                <Collapsible open={showHolidays} onOpenChange={setShowHolidays} className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-medium flex items-center gap-2">
                                <Calendar className="h-4 w-4" />
                                {t('generalSettings.publicHolidaysPreview')}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('generalSettings.publicHolidaysPreviewDescription')}
                            </p>
                        </div>

                        {/* Show/Hide Button */}
                        <CollapsibleTrigger asChild>
                            <Button variant="outline" size="sm">
                                <ChevronDown className={`h-4 w-4 mr-2 transition-transform ${showHolidays ? 'rotate-180' : ''}`} />
                                {showHolidays ? t('generalSettings.hideHolidays') : t('generalSettings.showHolidays')}
                            </Button>
                        </CollapsibleTrigger>
                    </div>

                    <CollapsibleContent className="space-y-4">
                        {/* Year Selector */}
                        <div className="flex items-center gap-2 justify-end">
                            {sitesWithCountry.length > 0 && (
                                <Select value={previewSiteId} onValueChange={setPreviewSiteId}>
                                    <SelectTrigger className="mr-auto w-auto min-w-[200px]" aria-label={t('generalSettings.holidaysSite')}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="global">
                                            {t('generalSettings.holidaysGlobal', { country: getCountryLabel(country) })}
                                        </SelectItem>
                                        {sitesWithCountry.map((s) => (
                                            <SelectItem key={s.id} value={String(s.id)}>
                                                {s.name} ({getCountryLabel(s.country as string)})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setSelectedYear(selectedYear - 1)}
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <div className="w-16 text-center font-medium">{selectedYear}</div>
                            <Button
                                size="icon"
                                variant="outline"
                                onClick={() => setSelectedYear(selectedYear + 1)}
                            >
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Holidays Table */}
                        {holidaysLoading ? (
                            <div className="flex items-center justify-center p-8 border rounded-lg">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : holidaysError ? (
                            <div className="text-center p-8 border rounded-lg bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                                <Calendar className="h-8 w-8 mx-auto mb-3 text-amber-600 dark:text-amber-400" />
                                <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-1">
                                    {t('generalSettings.holidaysApiNotImplemented')}
                                </p>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                    {t('generalSettings.holidaysApiNotImplementedDescription')}
                                </p>
                            </div>
                        ) : holidaysData && holidaysData.holidays.length > 0 ? (
                            <div className="border rounded-lg">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-[140px]">{t('generalSettings.date')}</TableHead>
                                            <TableHead>{t('generalSettings.holidayName')}</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {holidaysData.holidays.map((holiday, index) => (
                                            <TableRow key={index}>
                                                <TableCell className="font-mono text-sm">
                                                    {new Date(holiday.date).toLocaleDateString(calendarLocale, {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                    })}
                                                </TableCell>
                                                <TableCell>{holiday.name}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        ) : (
                            <div className="text-center p-8 border rounded-lg bg-muted/50">
                                <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">
                                    {t('generalSettings.noHolidaysData', { country: getCountryLabel(previewCountry), year: selectedYear })}
                                </p>
                            </div>
                        )}
                    </CollapsibleContent>
                </Collapsible>
            </SettingsSection>

            {/* SCHEDULING DEFAULTS */}
            <SettingsSection title={t('generalSettings.schedulingDefaults')} description={t('generalSettings.schedulingDefaultsDescription')} icon={Clock}>

                <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                        <Label htmlFor="defaultStartTime">{t('generalSettings.defaultStartTime')}</Label>
                        <Input
                            id="defaultStartTime"
                            type="time"
                            value={defaultStartTime}
                            onChange={(e) => handleDefaultStartTimeChange(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('generalSettings.defaultStartTimeDescription')}
                        </p>
                    </div>

                    <div className="space-y-3">
                        <Label htmlFor="defaultEndTime">{t('generalSettings.defaultEndTime')}</Label>
                        <Input
                            id="defaultEndTime"
                            type="time"
                            value={defaultEndTime}
                            onChange={(e) => handleDefaultEndTimeChange(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('generalSettings.defaultEndTimeDescription')}
                        </p>
                    </div>
                </div>
            </SettingsSection>

            {/* ADD-ONS */}
            <SettingsSection title={t('settings.addons')} description={t('settings.addonsDescription')} icon={Puzzle}>

                <div className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                            <Label htmlFor="todoListEnabled">{t('settings.todoListEnabled')}</Label>
                            <p className="text-xs text-muted-foreground">
                                {t('settings.todoListHint')}
                            </p>
                        </div>
                        <Switch
                            id="todoListEnabled"
                            checked={getSettingAsBool('addons.todolist.enabled')}
                            onCheckedChange={(checked) => updateSetting({ key: 'addons.todolist.enabled', value: String(checked) })}
                        />
                    </div>
                </div>
            </SettingsSection>
        </div>
    );
}
