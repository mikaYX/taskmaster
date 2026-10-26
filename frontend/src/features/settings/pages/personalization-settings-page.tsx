import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings, SETTINGS_SAVED_TOAST_ID } from '../hooks/use-settings';
import { settingsApi } from '@/api/settings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTheme } from '@/components/theme-provider';
import { Separator } from '@/components/ui/separator';
import { Loader2, ImageUp, X, Palette, AlignLeft, AlignCenter, RotateCcw, Pipette, Sun, Moon, Monitor, Check, SunMoon } from 'lucide-react';
import { SettingsSection } from '../components/settings-section';
import { cn } from '@/lib/utils';
import {
    LOGIN_CARD_OPACITY_MAX, LOGIN_CARD_OPACITY_MIN, WALLPAPER_BLUR_MAX, WALLPAPER_DIM_MAX,
    loginCardStyle, parseLoginCardOpacity, parseWallpaperBlur, parseWallpaperDim, wallpaperLayerStyle,
} from '@/features/auth/login-card-style';
import { accentContrastRatio, accentForeground, isValidAccentColor } from '@/lib/accent-color';
import { toast } from 'sonner';
const THEME_COLORS = {
    default: '#3b82f6',
    blue: '#0ea5e9',
    green: '#10b981',
    purple: '#a855f7',
    orange: '#f97316',
};

/** Values the form returns to with "reset"; saving them also removes the uploaded files from the server. */
const BRANDING_DEFAULTS = {
    appTitle: 'Taskmaster',
    appSubtitle: 'Task Management System',
    showAppTitle: true,
    showAppSubtitle: true,
    logoAlign: 'left',
    textAlign: 'left',
    cardOpacity: LOGIN_CARD_OPACITY_MAX,
    wallpaperBlur: 0,
    wallpaperDim: 0,
    welcomeText: '',
    loginMessage: '',
};

interface RangeFieldProps {
    id: string;
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    unit: string;
    onChange: (value: number) => void;
}

function RangeField({ id, label, value, min, max, step, unit, onChange }: RangeFieldProps) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <Label htmlFor={id}>{label}</Label>
                <span className="text-sm font-medium tabular-nums text-primary">{value}{unit}</span>
            </div>
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="w-full cursor-pointer accent-primary"
            />
        </div>
    );
}

interface AlignmentToggleProps {
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
    labelledBy: string;
}

/** Full-width segmented choice, every option visible at once. */
function AlignmentToggle({ value, onChange, options, labelledBy }: AlignmentToggleProps) {
    return (
        <div role="radiogroup" aria-labelledby={labelledBy} className="grid w-full grid-flow-col auto-cols-fr gap-1 rounded-lg border bg-muted/40 p-1">
            {options.map(({ value: optionValue, label, icon: Icon }) => {
                const selected = value === optionValue;
                return (
                    <button
                        key={optionValue}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(optionValue)}
                        className={cn(
                            'flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                            selected ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                    >
                        <Icon className="h-4 w-4" />
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

export function PersonalizationSettingsPage() {
    const { t } = useTranslation();
    const { setTheme: setSystemTheme } = useTheme();
    const { settings, getSetting, updateSetting, isLoading, isUpdating } = useSettings();

    // Auto-save settings (appearance)
    const [displayMode, setDisplayMode] = useState<'light' | 'dark' | 'system'>('system');
    const [colorTheme, setColorTheme] = useState('default');

    // Manual-save settings (branding)
    const [appTitle, setAppTitle] = useState('');
    const [appSubtitle, setAppSubtitle] = useState('');
    const [showAppTitle, setShowAppTitle] = useState(true);
    const [showAppSubtitle, setShowAppSubtitle] = useState(true);
    const [logoAlign, setLogoAlign] = useState('left');
    const [textAlign, setTextAlign] = useState('left');
    const [cardOpacity, setCardOpacity] = useState(LOGIN_CARD_OPACITY_MAX);
    const [wallpaperBlur, setWallpaperBlur] = useState(0);
    const [wallpaperDim, setWallpaperDim] = useState(0);
    const [welcomeText, setWelcomeText] = useState('');
    const [loginMessage, setLoginMessage] = useState('');
    const [accentColor, setAccentColor] = useState('');
    const [logoDarkUrl, setLogoDarkUrl] = useState('');
    const [logoDarkFile, setLogoDarkFile] = useState<File | null>(null);
    const [logoDarkPreviewDataUrl, setLogoDarkPreviewDataUrl] = useState<string | null>(null);
    const [logoUrl, setLogoUrl] = useState('');
    const [faviconUrl, setFaviconUrl] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [faviconFile, setFaviconFile] = useState<File | null>(null);
    const [wallpaperUrl, setWallpaperUrl] = useState('');
    const [wallpaperFile, setWallpaperFile] = useState<File | null>(null);
    const [wallpaperPreviewDataUrl, setWallpaperPreviewDataUrl] = useState<string | null>(null);
    const [logoPreviewDataUrl, setLogoPreviewDataUrl] = useState<string | null>(null);
    const [faviconPreviewDataUrl, setFaviconPreviewDataUrl] = useState<string | null>(null);

    const [initialBranding, setInitialBranding] = useState({
        appTitle: '',
        appSubtitle: '',
        logoUrl: '',
        faviconUrl: '',
        wallpaperUrl: '',
        showAppTitle: true,
        showAppSubtitle: true,
        logoAlign: 'left',
        textAlign: 'left',
        cardOpacity: LOGIN_CARD_OPACITY_MAX,
        wallpaperBlur: 0,
        wallpaperDim: 0,
        welcomeText: '',
        loginMessage: '',
        logoDarkUrl: ''
    });

    const isInitialized = useRef(false);

    // Load settings only once
    useEffect(() => {
        if (settings.length > 0 && !isInitialized.current) {
            const mode = (getSetting('ui.displayMode') || 'system') as 'light' | 'dark' | 'system';
            const thm = getSetting('ui.theme') || 'default';
            const title = getSetting('app.title') || '';
            const subtitle = getSetting('app.subtitle') || '';
            const showTitle = getSetting('app.showTitle');
            const showSubtitle = getSetting('app.showSubtitle');
            const logoAl = getSetting('app.logoAlign') || 'left';
            const textAl = getSetting('app.textAlign') || 'left';
            const opacity = parseLoginCardOpacity(getSetting('app.loginCardOpacity'));
            const blur = parseWallpaperBlur(getSetting('app.wallpaperBlur'));
            const dim = parseWallpaperDim(getSetting('app.wallpaperDim'));
            const welcome = getSetting('app.loginWelcomeText') || '';
            const message = getSetting('app.loginMessage') || '';
            const accent = getSetting('app.accentColor') || '';
            const logoDark = getSetting('app.logoDarkUrl') || '';
            const logo = getSetting('app.logoUrl') || '';
            const favicon = getSetting('app.faviconUrl') || '';
            const wallpaper = getSetting('app.wallpaperUrl') || '';

            // Wrap initialisation in setTimeout to avoid cascading render warning
            setTimeout(() => {
                setDisplayMode(mode);
                setColorTheme(thm);
                setAppTitle(title);
                setAppSubtitle(subtitle);
                setShowAppTitle(showTitle === undefined ? true : showTitle === 'true');
                setShowAppSubtitle(showSubtitle === undefined ? true : showSubtitle === 'true');
                setLogoAlign(logoAl);
                setTextAlign(textAl);
                setCardOpacity(opacity);
                setWallpaperBlur(blur);
                setWallpaperDim(dim);
                setWelcomeText(welcome);
                setLoginMessage(message);
                setAccentColor(accent);
                setLogoDarkUrl(logoDark);
                setLogoUrl(logo);
                setFaviconUrl(favicon);
                setWallpaperUrl(wallpaper);

                setInitialBranding({
                    appTitle: title,
                    appSubtitle: subtitle,
                    logoUrl: logo,
                    faviconUrl: favicon,
                    wallpaperUrl: wallpaper,
                    showAppTitle: showTitle === undefined ? true : showTitle === 'true',
                    showAppSubtitle: showSubtitle === undefined ? true : showSubtitle === 'true',
                    logoAlign: logoAl,
                    textAlign: textAl,
                    cardOpacity: opacity,
                    wallpaperBlur: blur,
                    wallpaperDim: dim,
                    welcomeText: welcome,
                    loginMessage: message,
                    logoDarkUrl: logoDark
                });
            }, 0);
            isInitialized.current = true;
        }
    }, [getSetting, settings.length]);

    const hasUnsavedChanges =
        appTitle !== initialBranding.appTitle ||
        appSubtitle !== initialBranding.appSubtitle ||
        showAppTitle !== initialBranding.showAppTitle ||
        showAppSubtitle !== initialBranding.showAppSubtitle ||
        logoAlign !== initialBranding.logoAlign ||
        textAlign !== initialBranding.textAlign ||
        cardOpacity !== initialBranding.cardOpacity ||
        wallpaperBlur !== initialBranding.wallpaperBlur ||
        wallpaperDim !== initialBranding.wallpaperDim ||
        welcomeText !== initialBranding.welcomeText ||
        loginMessage !== initialBranding.loginMessage ||
        logoDarkUrl !== initialBranding.logoDarkUrl ||
        logoDarkFile !== null ||
        logoUrl !== initialBranding.logoUrl ||
        faviconUrl !== initialBranding.faviconUrl ||
        wallpaperUrl !== initialBranding.wallpaperUrl ||
        logoFile !== null ||
        faviconFile !== null ||
        wallpaperFile !== null;


    // Manual save for branding
    const handleSaveBranding = async () => {
        try {
            let savedLogoDarkUrl = logoDarkUrl;
            let savedLogoUrl = logoUrl;
            let savedFaviconUrl = faviconUrl;
            let savedWallpaperUrl = wallpaperUrl;

            if (logoFile) {
                const res = await settingsApi.uploadLogo(logoFile);
                savedLogoUrl = res.url;
                setLogoUrl(res.url);
                updateSetting({ key: 'app.logoUrl', value: res.url }, { silent: true });
                setLogoFile(null);
                setLogoPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.logoUrl', value: logoUrl }, { silent: true });
            }

            if (logoDarkFile) {
                const res = await settingsApi.uploadLogoDark(logoDarkFile);
                savedLogoDarkUrl = res.url;
                setLogoDarkUrl(res.url);
                updateSetting({ key: 'app.logoDarkUrl', value: res.url }, { silent: true });
                setLogoDarkFile(null);
                setLogoDarkPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.logoDarkUrl', value: logoDarkUrl }, { silent: true });
            }

            if (faviconFile) {
                const res = await settingsApi.uploadFavicon(faviconFile);
                savedFaviconUrl = res.url;
                setFaviconUrl(res.url);
                updateSetting({ key: 'app.faviconUrl', value: res.url }, { silent: true });
                setFaviconFile(null);
                setFaviconPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.faviconUrl', value: faviconUrl }, { silent: true });
            }

            if (wallpaperFile) {
                const res = await settingsApi.uploadWallpaper(wallpaperFile);
                savedWallpaperUrl = res.url;
                setWallpaperUrl(res.url);
                updateSetting({ key: 'app.wallpaperUrl', value: res.url }, { silent: true });
                setWallpaperFile(null);
                setWallpaperPreviewDataUrl(null);
            } else {
                updateSetting({ key: 'app.wallpaperUrl', value: wallpaperUrl }, { silent: true });
            }

            updateSetting({ key: 'app.title', value: appTitle }, { silent: true });
            updateSetting({ key: 'app.subtitle', value: appSubtitle }, { silent: true });
            updateSetting({ key: 'app.showTitle', value: String(showAppTitle) }, { silent: true });
            updateSetting({ key: 'app.showSubtitle', value: String(showAppSubtitle) }, { silent: true });
            updateSetting({ key: 'app.logoAlign', value: logoAlign }, { silent: true });
            updateSetting({ key: 'app.textAlign', value: textAlign }, { silent: true });
            updateSetting({ key: 'app.loginCardOpacity', value: String(cardOpacity) }, { silent: true });
            updateSetting({ key: 'app.wallpaperBlur', value: String(wallpaperBlur) }, { silent: true });
            updateSetting({ key: 'app.wallpaperDim', value: String(wallpaperDim) }, { silent: true });
            updateSetting({ key: 'app.loginWelcomeText', value: welcomeText.trim() }, { silent: true });
            updateSetting({ key: 'app.loginMessage', value: loginMessage.trim() }, { silent: true });

            setInitialBranding({
                appTitle,
                appSubtitle,
                logoUrl: savedLogoUrl,
                faviconUrl: savedFaviconUrl,
                wallpaperUrl: savedWallpaperUrl,
                showAppTitle,
                showAppSubtitle,
                logoAlign,
                textAlign,
                cardOpacity,
                wallpaperBlur,
                wallpaperDim,
                welcomeText: welcomeText.trim(),
                loginMessage: loginMessage.trim(),
                logoDarkUrl: savedLogoDarkUrl
            });
            toast.success(t('generalSettings.brandingUpdated'), { id: SETTINGS_SAVED_TOAST_ID });
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
        if (!logoDarkFile) return;
        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled) setLogoDarkPreviewDataUrl(reader.result as string); };
        reader.readAsDataURL(logoDarkFile);
        return () => { cancelled = true; };
    }, [logoDarkFile]);

    useEffect(() => {
        if (!faviconFile) return;
        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled) setFaviconPreviewDataUrl(reader.result as string); };
        reader.readAsDataURL(faviconFile);
        return () => { cancelled = true; };
    }, [faviconFile]);

    useEffect(() => {
        if (!wallpaperFile) return;
        let cancelled = false;
        const reader = new FileReader();
        reader.onload = () => { if (!cancelled) setWallpaperPreviewDataUrl(reader.result as string); };
        reader.readAsDataURL(wallpaperFile);
        return () => { cancelled = true; };
    }, [wallpaperFile]);

    const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setLogoFile(file);
    };

    const handleLogoDarkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setLogoDarkFile(file);
    };

    const handleRemoveLogoDark = () => {
        setLogoDarkFile(null);
        setLogoDarkUrl('');
        setLogoDarkPreviewDataUrl(null);
    };

    /** Puts the whole form back to the defaults; nothing is stored until "Save". */
    const handleResetBranding = () => {
        setAppTitle(BRANDING_DEFAULTS.appTitle);
        setAppSubtitle(BRANDING_DEFAULTS.appSubtitle);
        setShowAppTitle(BRANDING_DEFAULTS.showAppTitle);
        setShowAppSubtitle(BRANDING_DEFAULTS.showAppSubtitle);
        setLogoAlign(BRANDING_DEFAULTS.logoAlign);
        setTextAlign(BRANDING_DEFAULTS.textAlign);
        setCardOpacity(BRANDING_DEFAULTS.cardOpacity);
        setWallpaperBlur(BRANDING_DEFAULTS.wallpaperBlur);
        setWallpaperDim(BRANDING_DEFAULTS.wallpaperDim);
        setWelcomeText(BRANDING_DEFAULTS.welcomeText);
        setLoginMessage(BRANDING_DEFAULTS.loginMessage);
        handleResetLogo();
        handleRemoveLogoDark();
        handleResetFavicon();
        handleResetWallpaper();
        toast.info(t('generalSettings.resetBrandingDone'));
    };

    const handleFaviconFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setFaviconFile(file);
    };

    const handleWallpaperFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) setWallpaperFile(file);
    };

    const handleResetWallpaper = () => {
        setWallpaperFile(null);
        setWallpaperUrl('');
        setWallpaperPreviewDataUrl(null);
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

    const handleDisplayModeChange = (mode: 'light' | 'dark' | 'system') => {
        setDisplayMode(mode);
        setSystemTheme(mode);
        updateSetting({ key: 'ui.displayMode', value: mode }, { silent: true });
        toast.success(t('generalSettings.displayModeUpdated'), { id: SETTINGS_SAVED_TOAST_ID });
    };

    const accentInvalid = accentColor !== '' && !isValidAccentColor(accentColor);
    const accentSaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    useEffect(() => () => clearTimeout(accentSaveTimer.current), []);

    const persistAccent = (value: string) => {
        updateSetting({ key: 'app.accentColor', value }, { silent: true });
        toast.success(t('generalSettings.themeUpdated'), { id: SETTINGS_SAVED_TOAST_ID });
    };

    /** Preset swatches: the first one is the theme's native colour, the others set the accent. */
    const handlePresetChange = (name: string) => {
        clearTimeout(accentSaveTimer.current);
        if (name === 'default') {
            setColorTheme('default');
            updateSetting({ key: 'ui.theme', value: 'default' }, { silent: true });
            setAccentColor('');
            persistAccent('');
            return;
        }
        const color = THEME_COLORS[name as keyof typeof THEME_COLORS];
        setAccentColor(color);
        persistAccent(color);
    };

    /** Free choice: saved shortly after the user stops moving the picker or typing a valid colour. */
    const handleAccentInput = (value: string) => {
        setAccentColor(value);
        clearTimeout(accentSaveTimer.current);
        if (value === '' || isValidAccentColor(value)) {
            accentSaveTimer.current = setTimeout(() => persistAccent(value), 500);
        }
    };

    // Installs that picked a theme colour before the accent existed keep showing it as selected.
    const isPresetSelected = (name: string) => {
        if (name === 'default') return !accentColor && !(colorTheme in THEME_COLORS && colorTheme !== 'default');
        const color = THEME_COLORS[name as keyof typeof THEME_COLORS];
        return accentColor ? accentColor.toLowerCase() === color.toLowerCase() : colorTheme === name;
    };
    const isCustomAccent = !!accentColor && !Object.keys(THEME_COLORS).some(isPresetSelected);

    const getThemeColorLabel = (themeName: string) => t(`generalSettings.themeColors.${themeName}`);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <SettingsSection title={t('generalSettings.branding')} description={t('generalSettings.brandingDescription')} icon={Palette}>

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

                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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

                        {/* Dark Logo Upload */}
                        <div className="space-y-3">
                            <Label>{t('generalSettings.logoDark')}</Label>
                            <div className="space-y-2">
                                {(logoDarkUrl || logoDarkFile) ? (
                                    <div className="relative border-2 border-dashed rounded-lg h-40 flex items-center justify-center bg-neutral-900 overflow-hidden">
                                        <img
                                            src={(logoDarkFile && logoDarkPreviewDataUrl) ? logoDarkPreviewDataUrl : logoDarkUrl}
                                            alt={t('generalSettings.logoDarkPreviewAlt')}
                                            className="max-h-full max-w-full object-contain p-4"
                                        />
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={handleRemoveLogoDark}
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
                                            accept="image/png,image/jpeg,image/webp"
                                            onChange={handleLogoDarkFileChange}
                                        />
                                    </label>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('generalSettings.logoDarkHint')}</p>
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

                        <div className="grid gap-6 md:col-span-2 md:grid-cols-2 lg:col-span-3">
                            <div className="space-y-2">
                                <Label id="logoAlignLabel">{t('generalSettings.logoAlignment')}</Label>
                                <AlignmentToggle
                                    labelledBy="logoAlignLabel"
                                    value={logoAlign}
                                    onChange={setLogoAlign}
                                    options={[
                                        { value: 'left', label: t('generalSettings.alignLeft'), icon: AlignLeft },
                                        { value: 'center', label: t('generalSettings.alignCenter'), icon: AlignCenter },
                                    ]}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label id="textAlignLabel">{t('generalSettings.textAlignment')}</Label>
                                <AlignmentToggle
                                    labelledBy="textAlignLabel"
                                    value={textAlign}
                                    onChange={setTextAlign}
                                    options={[
                                        { value: 'left', label: t('generalSettings.alignLeft'), icon: AlignLeft },
                                        { value: 'center', label: t('generalSettings.alignCenter'), icon: AlignCenter },
                                    ]}
                                />
                            </div>
                        </div>

                        {/* Login Wallpaper Upload */}
                        <div className="space-y-3 md:col-span-2 lg:col-span-3">
                            <Label>{t('generalSettings.loginWallpaper')}</Label>
                            <div className="space-y-2">
                                {(wallpaperUrl || wallpaperFile) ? (
                                    <div className="relative border-2 border-dashed rounded-lg h-40 flex items-center justify-center bg-muted/50 overflow-hidden">
                                        <img
                                            src={(wallpaperFile && wallpaperPreviewDataUrl) ? wallpaperPreviewDataUrl : wallpaperUrl}
                                            alt={t('generalSettings.wallpaperPreviewAlt')}
                                            className="h-full w-full object-cover"
                                        />
                                        <Button
                                            size="icon"
                                            variant="destructive"
                                            className="absolute top-2 right-2 h-6 w-6"
                                            onClick={handleResetWallpaper}
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
                                            accept="image/png,image/jpeg,image/webp"
                                            onChange={handleWallpaperFileChange}
                                        />
                                    </label>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground">{t('generalSettings.usedInLoginScreen')}</p>

                            {/* Card transparency with live preview */}
                            <div className="grid gap-4 pt-2 md:grid-cols-2 md:items-center">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="loginCardOpacity">{t('generalSettings.loginCardOpacity')}</Label>
                                        <span className="text-sm font-medium tabular-nums text-primary">{cardOpacity}%</span>
                                    </div>
                                    <input
                                        id="loginCardOpacity"
                                        type="range"
                                        min={LOGIN_CARD_OPACITY_MIN}
                                        max={LOGIN_CARD_OPACITY_MAX}
                                        step={5}
                                        value={cardOpacity}
                                        onChange={(e) => setCardOpacity(Number(e.target.value))}
                                        className="w-full cursor-pointer accent-primary"
                                    />
                                    <RangeField
                                        id="wallpaperBlur"
                                        label={t('generalSettings.wallpaperBlur')}
                                        value={wallpaperBlur}
                                        min={0}
                                        max={WALLPAPER_BLUR_MAX}
                                        step={1}
                                        unit="px"
                                        onChange={setWallpaperBlur}
                                    />
                                    <RangeField
                                        id="wallpaperDim"
                                        label={t('generalSettings.wallpaperDim')}
                                        value={wallpaperDim}
                                        min={0}
                                        max={WALLPAPER_DIM_MAX}
                                        step={5}
                                        unit="%"
                                        onChange={setWallpaperDim}
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        {(wallpaperUrl || wallpaperFile)
                                            ? t('generalSettings.loginCardOpacityHint')
                                            : t('generalSettings.loginCardOpacityNeedsWallpaper')}
                                    </p>
                                </div>
                                <div
                                    className="relative flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-gradient-to-br from-primary/40 via-muted to-primary/10"
                                    aria-hidden="true"
                                >
                                    {(wallpaperUrl || wallpaperFile) && (
                                        <>
                                            <div
                                                className="absolute inset-0 bg-cover bg-center"
                                                style={wallpaperLayerStyle((wallpaperFile && wallpaperPreviewDataUrl) ? wallpaperPreviewDataUrl : wallpaperUrl, Math.round(wallpaperBlur / 2))}
                                            />
                                            {wallpaperDim > 0 && (
                                                <div className="absolute inset-0 bg-black" style={{ opacity: wallpaperDim / 100 }} />
                                            )}
                                        </>
                                    )}
                                    <div className="relative w-40 space-y-2 rounded-xl border bg-card p-3 shadow-lg" style={loginCardStyle(cardOpacity)}>
                                        <div className="mx-auto h-2 w-16 rounded bg-foreground/70" />
                                        <div className="h-5 rounded border bg-background/60" />
                                        <div className="h-5 rounded border bg-background/60" />
                                        <div className="ml-auto h-5 w-14 rounded bg-primary" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Login screen texts */}
                        <div className="space-y-4 md:col-span-2 lg:col-span-3">
                            <div className="space-y-2">
                                <Label htmlFor="loginWelcomeText">{t('generalSettings.loginWelcomeText')}</Label>
                                <Input
                                    id="loginWelcomeText"
                                    value={welcomeText}
                                    onChange={(e) => setWelcomeText(e.target.value)}
                                    placeholder={t('auth.signInToAccount')}
                                    maxLength={100}
                                />
                            </div>
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="loginMessage">{t('generalSettings.loginMessage')}</Label>
                                    <span className="text-xs tabular-nums text-muted-foreground">{loginMessage.length}/300</span>
                                </div>
                                <Textarea
                                    id="loginMessage"
                                    value={loginMessage}
                                    onChange={(e) => setLoginMessage(e.target.value)}
                                    placeholder={t('generalSettings.loginMessagePlaceholder')}
                                    maxLength={300}
                                    rows={3}
                                />
                                <p className="text-xs text-muted-foreground">{t('generalSettings.loginMessageHint')}</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Save Button */}
                <div className="flex items-center justify-between gap-3 pt-4">
                    <Button type="button" variant="outline" onClick={handleResetBranding}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        {t('generalSettings.resetBranding')}
                    </Button>
                    <Button
                        onClick={handleSaveBranding}
                        disabled={!hasUnsavedChanges || isUpdating}
                    >
                        {isUpdating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('generalSettings.saveBrandingChanges')}
                    </Button>
                </div>
            </SettingsSection>

            {/* APPEARANCE */}
            <SettingsSection title={t('generalSettings.appearance')} description={t('generalSettings.appearanceDescription')} icon={SunMoon}>

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

                {/* Accent colour: presets + free choice */}
                <div className="space-y-3">
                    <Label>{t('generalSettings.theme')}</Label>
                    <div className="flex flex-wrap gap-3">
                        {Object.entries(THEME_COLORS).map(([name, color]) => (
                            <button
                                key={name}
                                type="button"
                                onClick={() => handlePresetChange(name)}
                                className={cn(
                                    'relative w-12 h-12 rounded-full border-2 transition-all',
                                    isPresetSelected(name) ? 'border-foreground scale-110' : 'border-muted hover:scale-105'
                                )}
                                style={{ backgroundColor: color }}
                                title={getThemeColorLabel(name)}
                            >
                                {isPresetSelected(name) && (
                                    <Check className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow-md" />
                                )}
                            </button>
                        ))}
                        <label
                            className={cn(
                                'relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-full border-2 transition-all',
                                isCustomAccent ? 'scale-110 border-foreground' : 'border-dashed border-muted-foreground/50 hover:scale-105'
                            )}
                            style={isCustomAccent ? { backgroundColor: accentColor } : undefined}
                            title={t('generalSettings.accentColorCustom')}
                        >
                            {isCustomAccent
                                ? <Check className="h-6 w-6 text-white drop-shadow-md" />
                                : <Pipette className="h-5 w-5 text-muted-foreground" />}
                            <input
                                type="color"
                                aria-label={t('generalSettings.accentColorCustom')}
                                value={isValidAccentColor(accentColor) ? accentColor : '#3b82f6'}
                                onChange={(e) => handleAccentInput(e.target.value)}
                                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                            />
                        </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <Label htmlFor="accentColorHex" className="text-xs text-muted-foreground">{t('generalSettings.accentColorHex')}</Label>
                        <Input
                            id="accentColorHex"
                            value={accentColor}
                            onChange={(e) => handleAccentInput(e.target.value.trim())}
                            placeholder="#3b82f6"
                            maxLength={7}
                            aria-invalid={accentInvalid}
                            className="w-32 font-mono"
                        />
                        {isValidAccentColor(accentColor) && (
                            <span
                                className="rounded-md px-3 py-1.5 text-sm font-medium"
                                style={{ backgroundColor: accentColor, color: accentForeground(accentColor) }}
                            >
                                {t('generalSettings.accentColorPreview')}
                            </span>
                        )}
                    </div>
                    {accentInvalid && (
                        <p className="text-xs text-destructive">{t('generalSettings.accentColorInvalid')}</p>
                    )}
                    {isValidAccentColor(accentColor) && accentContrastRatio(accentColor) < 4.5 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">{t('generalSettings.accentColorLowContrast')}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{t('generalSettings.themeDescription')}</p>
                </div>
            </SettingsSection>
        </div>
    );
}
