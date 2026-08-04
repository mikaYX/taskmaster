import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useTheme } from '@/components/theme-provider';
import { useSettings } from '../hooks/use-settings';
import { settingsApi } from '@/api/settings';
import { useHolidays } from '@/hooks/use-holidays';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sun, Moon, Monitor, ImageUp, X, Check, ChevronLeft, ChevronRight, Calendar, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
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

const THEME_COLORS = {
    default: '#3b82f6',
    blue: '#0ea5e9',
    green: '#10b981',
    purple: '#a855f7',
    orange: '#f97316',
};

export function GeneralSettingsPage() {
    const { t, i18n } = useTranslation();
    const { setTheme: setSystemTheme } = useTheme();
    const { settings, getSetting, getSettingAsBool, updateSetting, isLoading, isUpdating } = useSettings();

    // Auto-save settings
    const [language, setLanguage] = useState('en');
    const [country, setCountry] = useState('FR');
    const [displayMode, setDisplayMode] = useState<'light' | 'dark' | 'system'>('system');
    const [colorTheme, setColorTheme] = useState('default');

    // Scheduling Defaults
    const [defaultStartTime, setDefaultStartTime] = useState('08:00');
    const [defaultEndTime, setDefaultEndTime] = useState('18:00');

    // Holidays preview
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [showHolidays, setShowHolidays] = useState(false);
    const { data: holidaysData, isLoading: holidaysLoading, error: holidaysError } = useHolidays(country, selectedYear, showHolidays);

    // Manual-save settings (branding)
    const [appTitle, setAppTitle] = useState('');
    const [appSubtitle, setAppSubtitle] = useState('');
    const [showAppTitle, setShowAppTitle] = useState(true);
    const [showAppSubtitle, setShowAppSubtitle] = useState(true);
    const [logoUrl, setLogoUrl] = useState('');
    const [faviconUrl, setFaviconUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [logoPreviewDataUrl, setLogoPreviewDataUrl] = useState<string | null>(null);
    const [faviconPreviewDataUrl, setFaviconPreviewDataUrl] = useState<string | null>(null);

    const [initialBranding, setInitialBranding] = useState({
        appTitle: '',
        appSubtitle: '',
        logoUrl: '',
        faviconUrl: '',
        showAppTitle: true,
        showAppSubtitle: true
    });

    const isInitialized = useRef(false);
    const calendarLocale = i18n.resolvedLanguage?.startsWith('fr') ? 'fr-FR' : 'en-GB';

    const getCountryLabel = (countryCode: string) => t(`generalSettings.countries.${countryCode}`);
    const getHolidaySourceLabel = (countryCode: string) => t(`generalSettings.holidaySources.${countryCode}`);
    const getThemeColorLabel = (themeName: string) => t(`generalSettings.themeColors.${themeName}`);

    // Load settings only once
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            const lang = getSetting('ui.language') || 'en';
            const ctr = getSetting('app.country') || 'FR';
            const mode = (getSetting('ui.displayMode') || 'system') as 'light' | 'dark' | 'system';
            const thm = getSetting('ui.theme') || 'default';
            const defaultStart = getSetting('SCHEDULE_DEFAULT_START_TIME') || '08:00';
            const defaultEnd = getSetting('SCHEDULE_DEFAULT_END_TIME') || '18:00';
            const title = getSetting('app.title') || '';
            const subtitle = getSetting('app.subtitle') || '';
            const showTitle = getSetting('app.showTitle');
            const showSubtitle = getSetting('app.showSubtitle');
            const logo = getSetting('app.logoUrl') || '';
            const favicon = getSetting('app.faviconUrl') || '';

            // Wrap initialisation in setTimeout to avoid cascading render warning
            setTimeout(() => {
                setLanguage(lang);
                setCountry(ctr);
                setDisplayMode(mode);
                setColorTheme(thm);
                setDefaultStartTime(defaultStart);
                setDefaultEndTime(defaultEnd);
                setAppTitle(title);
                setAppSubtitle(subtitle);
                setShowAppTitle(showTitle === undefined ? true : showTitle === 'true');
                setShowAppSubtitle(showSubtitle === undefined ? true : showSubtitle === 'true');
                setLogoUrl(logo);
                setFaviconUrl(favicon);

                setInitialBranding({
                    appTitle: title,
                    appSubtitle: subtitle,
                    logoUrl: logo,
                    faviconUrl: favicon,
                    showAppTitle: showTitle === undefined ? true : showTitle === 'true',
                    showAppSubtitle: showSubtitle === undefined ? true : showSubtitle === 'true'
                });
            }, 0);
            isInitialized.current = true;
        }
    }, [settings.length]);

    const hasUnsavedChanges =
        appTitle !== initialBranding.appTitle ||
        appSubtitle !== initialBranding.appSubtitle ||
        showAppTitle !== initialBranding.showAppTitle ||
        showAppSubtitle !== initialBranding.showAppSubtitle ||
        logoUrl !== initialBranding.logoUrl ||
        faviconUrl !== initialBranding.faviconUrl ||
        logoFile !== null ||
        faviconFile !== null;

    // Auto-save handlers
    const handleLanguageChange = (newLang: string) => {
        setLanguage(newLang);
        updateSetting({ key: 'ui.language', value: newLang });
        i18n.changeLanguage(newLang.toLowerCase());
        toast.success(t('generalSettings.languageUpdated'));
    };

    const handleCountryChange = (newCountry: string) => {
        setCountry(newCountry);
        updateSetting({ key: 'app.country', value: newCountry });
        toast.success(t('generalSettings.countryUpdated'));
    };

    const handleDisplayModeChange = (mode: 'light' | 'dark' | 'system') => {
        setDisplayMode(mode);
        setSystemTheme(mode);
        updateSetting({ key: 'ui.displayMode', value: mode });
        toast.success(t('generalSettings.displayModeUpdated'));
    };

    const handleColorThemeChange = (thm: string) => {
        setColorTheme(thm);
        updateSetting({ key: 'ui.theme', value: thm });
        toast.success(t('generalSettings.themeUpdated'));
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

    // Manual save for branding
    const handleSaveBranding = async () => {
        try {
            let savedLogoUrl = logoUrl;
            let savedFaviconUrl = faviconUrl;

            if (logoFile) {
                const res = await settingsApi.uploadLogo(logoFile);
                savedLogoUrl = res.url;
                setLogoUrl(res.url);
                updateSetting({ key: 'app.logoUrl', value: res.url });
                setLogoFile(null);
                setLogoPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.logoUrl', value: logoUrl });
            }

            if (faviconFile) {
                const res = await settingsApi.uploadFavicon(faviconFile);
                savedFaviconUrl = res.url;
                setFaviconUrl(res.url);
                updateSetting({ key: 'app.faviconUrl', value: res.url });
                setFaviconFile(null);
                setFaviconPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.faviconUrl', value: faviconUrl });
            }

            updateSetting({ key: 'app.title', value: appTitle });
            updateSetting({ key: 'app.subtitle', value: appSubtitle });
            updateSetting({ key: 'app.showTitle', value: String(showAppTitle) });
            updateSetting({ key: 'app.showSubtitle', value: String(showAppSubtitle) });

            setInitialBranding({
                appTitle,
                appSubtitle,
                logoUrl: savedLogoUrl,
                faviconUrl: savedFaviconUrl,
                showAppTitle,
                showAppSubtitle
            });
            toast.success(t('generalSettings.brandingUpdated'));
        } catch {
            toast.error(t('generalSettings.brandingUpdateFailed'));
        }
    };

    // Preview des fichiers sélectionnés en data URL (fiable avant save, pas de blob à révoquer)
    useEffect(() => {
        if (!logoFile) return;
        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled) setLogoPreviewDataUrl(reader.result as string); };
        reader.readAsDataURL(logoFile);
        return () => { cancelled = true; };
    }, [logoFile]);

    useEffect(() => {
        if (!faviconFile) return;
        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled) setFaviconPreviewDataUrl(reader.result as string); };
        reader.readAsDataURL(faviconFile);
        return () => { cancelled = true; };
    }, [faviconFile]);

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setLogoFile(file);
    };

    const handleFaviconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setFaviconFile(file);
    };

    const handleResetLogo = () => {
        setLogoFile(null);
        setLogoUrl('');
        setLogoPreviewDataUrl(null);
    };

    const handleResetFavicon = () => {
        setFaviconFile(null);
        setFaviconUrl('');
        setFaviconPreviewDataUrl(null);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-10 max-w-6xl">
            {/* LANGUAGE & REGION */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">{t('generalSettings.languageAndRegion')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('generalSettings.languageAndRegionDescription')}
                    </p>
                </div>

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
                                    {t('generalSettings.noHolidaysData', { country: getCountryLabel(country), year: selectedYear })}
                                </p>
                            </div>
                        )}
                    </CollapsibleContent>
                </Collapsible>
            </div>

            <Separator />

            {/* SCHEDULING DEFAULTS */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">{t('generalSettings.schedulingDefaults')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('generalSettings.schedulingDefaultsDescription')}
                    </p>
                </div>

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
            </div>

            <Separator />

            {/* BRANDING */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">{t('generalSettings.branding')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('generalSettings.brandingDescription')}
                    </p>
                </div>

                {/* Application Naming */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium">{t('generalSettings.applicationNaming')}</h3>

                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="appTitle">{t('generalSettings.appTitle')}</Label>
                                <Switch
                                    checked={showAppTitle}
                                    onCheckedChange={setShowAppTitle}
                                    aria-label={t('generalSettings.toggleTitleVisibility')}
                                />
                            </div>
                            <Input
                                id="appTitle"
                                value={appTitle}
                                onChange={(e) => setAppTitle(e.target.value)}
                                placeholder="Taskmaster"
                                maxLength={50}
                                disabled={!showAppTitle}
                                className={!showAppTitle ? "opacity-50" : ""}
                            />
                            <p className="text-xs text-muted-foreground flex justify-between">
                                <span>{t('generalSettings.displayedInHeaderAndSidebar')}</span>
                                <span className={showAppTitle ? "text-primary" : "text-muted-foreground"}>
                                    {showAppTitle ? t('generalSettings.visible') : t('generalSettings.hidden')}
                                </span>
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="appSubtitle">{t('generalSettings.appSubtitle')}</Label>
                                <Switch
                                    checked={showAppSubtitle}
                                    onCheckedChange={setShowAppSubtitle}
                                    aria-label={t('generalSettings.toggleSubtitleVisibility')}
                                />
                            </div>
                            <Input
                                id="appSubtitle"
                                value={appSubtitle}
                                onChange={(e) => setAppSubtitle(e.target.value)}
                                placeholder={t('generalSettings.appSubtitlePlaceholder')}
                                maxLength={100}
                                disabled={!showAppSubtitle}
                                className={!showAppSubtitle ? "opacity-50" : ""}
                            />
                            <p className="text-xs text-muted-foreground flex justify-between">
                                <span>{t('generalSettings.secondaryBrandingText')}</span>
                                <span className={showAppSubtitle ? "text-primary" : "text-muted-foreground"}>
                                    {showAppSubtitle ? t('generalSettings.visible') : t('generalSettings.hidden')}
                                </span>
                            </p>
                        </div>
                    </div>
                </div>

                <Separator className="my-6" />

                {/* Visual Identity */}
                <div className="space-y-4">
                    <h3 className="text-sm font-medium">{t('generalSettings.visualIdentity')}</h3>

                    <div className="grid md:grid-cols-2 gap-6">
                        {/* Logo Upload */}
                        <div className="space-y-3">
                            <Label>{t('generalSettings.applicationLogo')}</Label>
                            <div className="space-y-2">
                                {(logoUrl || logoFile) ? (
                                    <div className="relative border-2 border-dashed rounded-lg h-40 flex items-center justify-center bg-muted/50 overflow-hidden">
                                        <img
                                            src={(logoFile && logoPreviewDataUrl) ? logoPreviewDataUrl : logoUrl}
                                            alt={t('generalSettings.logoPreviewAlt')}
                                            className="max-h-full max-w-full object-contain p-4"
                                        />
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={handleResetLogo}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <label className="border-2 border-dashed rounded-lg h-40 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
                                        <ImageUp className="h-8 w-8 text-muted-foreground mb-2" />
                                        <span className="text-sm text-muted-foreground">{t('generalSettings.clickToUpload')}</span>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/*"
                                            onChange={handleLogoFileChange}
                                        />
                                    </label>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('generalSettings.usedInHeaderAndSidebar')}</p>
                        </div>

                        {/* Favicon Upload */}
                        <div className="space-y-3">
                            <Label>{t('generalSettings.favicon')}</Label>
                            <div className="space-y-2">
                                {(faviconUrl || faviconFile) ? (
                                    <div className="relative border-2 border-dashed rounded-lg h-40 flex items-center justify-center bg-muted/50 overflow-hidden">
                                        <img
                                            src={(faviconFile && faviconPreviewDataUrl) ? faviconPreviewDataUrl : faviconUrl}
                                            alt={t('generalSettings.faviconPreviewAlt')}
                                            className="max-h-full max-w-full object-contain p-4"
                                        />
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={handleResetFavicon}
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <label className="border-2 border-dashed rounded-lg h-40 flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors">
                                        <ImageUp className="h-8 w-8 text-muted-foreground mb-2" />
                                        <span className="text-sm text-muted-foreground">{t('generalSettings.clickToUpload')}</span>
                                        <input
                                            type="file"
                                            className="hidden"
                                            accept="image/x-icon,image/png"
                                            onChange={handleFaviconFileChange}
                                        />
                                    </label>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('generalSettings.usedInBrowserTab')}</p>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex justify-end pt-4">
                    <Button
                        onClick={handleSaveBranding}
                        disabled={!hasUnsavedChanges || isUpdating}
                    >
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('generalSettings.saveBrandingChanges')}
                    </Button>
                </div>
            </div>

            <Separator />

            {/* ADD-ONS */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">{t('settings.addons')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('settings.addonsDescription')}
                    </p>
                </div>

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
            </div>

            <Separator />

            {/* APPEARANCE */}
            <div className="space-y-6">
                <div>
                    <h2 className="text-lg font-semibold">{t('generalSettings.appearance')}</h2>
                    <p className="text-sm text-muted-foreground">
                        {t('generalSettings.appearanceDescription')}
                    </p>
                </div>

                {/* Display Mode */}
                <div className="space-y-3">
                    <Label>{t('generalSettings.displayMode')}</Label>
                    <RadioGroup
                        value={displayMode}
                        onValueChange={(value) => handleDisplayModeChange(value as 'light' | 'dark' | 'system')}
                        className="grid grid-cols-3 gap-4"
                    >
                        <div>
                            <RadioGroupItem value="light" id="light" className="peer sr-only" />
                            <Label
                                htmlFor="light"
                                className={cn(
                                    'flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer',
                                    displayMode === 'light' && 'border-primary'
                                )}
                            >
                                <Sun className="mb-3 h-6 w-6" />
                                <span className="text-sm font-medium">{t('generalSettings.displayModeLight')}</span>
                            </Label>
                        </div>

                        <div>
                            <RadioGroupItem value="dark" id="dark" className="peer sr-only" />
                            <Label
                                htmlFor="dark"
                                className={cn(
                                    'flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer',
                                    displayMode === 'dark' && 'border-primary'
                                )}
                            >
                                <Moon className="mb-3 h-6 w-6" />
                                <span className="text-sm font-medium">{t('generalSettings.displayModeDark')}</span>
                            </Label>
                        </div>

                        <div>
                            <RadioGroupItem value="system" id="system" className="peer sr-only" />
                            <Label
                                htmlFor="system"
                                className={cn(
                                    'flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary cursor-pointer',
                                    displayMode === 'system' && 'border-primary'
                                )}
                            >
                                <Monitor className="mb-3 h-6 w-6" />
                                <span className="text-sm font-medium">{t('generalSettings.displayModeSystem')}</span>
                            </Label>
                        </div>
                    </RadioGroup>
                    <p className="text-xs text-muted-foreground">{t('generalSettings.languageAutoSave')}</p>
                </div>

                {/* Color Theme */}
                <div className="space-y-3">
                    <Label>{t('generalSettings.theme')}</Label>
                    <div className="flex gap-3">
                        {Object.entries(THEME_COLORS).map(([name, color]) => (
                            <button
                                key={name}
                                onClick={() => handleColorThemeChange(name)}
                                className={cn(
                                    'relative w-12 h-12 rounded-full border-2 transition-all',
                                    colorTheme === name ? 'border-foreground scale-110' : 'border-muted hover:scale-105'
                                )}
                                style={{ backgroundColor: color }}
                                title={getThemeColorLabel(name)}
                            >
                                {colorTheme === name && (
                                    <Check className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow-md" />
                                )}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted-foreground">{t('generalSettings.themeDescription')}</p>
                </div>
            </div>
        </div>
    );
}
