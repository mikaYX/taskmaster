import React, { useRef } from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Upload, Info } from 'lucide-react';
import { t, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { THEMES, applyTheme } from "@/lib/themes";

export function GeneralSettingsTab({
    lang,
    setupLang,
    setSetupLang,
    country,
    setCountry,
    displayMode,
    setDisplayMode,
    theme,
    setTheme,
    appTitle,
    setAppTitle,
    appSubtitle,
    setAppSubtitle,
    logoFile,
    setLogoFile,
    favFile,
    setFavFile,
    onConfigChange
}) {
    const logoInputRef = useRef(null);
    const favInputRef = useRef(null);

    const handleLanguageChange = async (val) => {
        setSetupLang(val);
        // Auto-save language immediately
        try {
            const token = localStorage.getItem("checklist_auth_token");
            await fetch("/api/settings", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ lang: val })
            });
            if (onConfigChange) onConfigChange();
        } catch (e) {
            console.error("Failed to auto-save language", e);
        }
    };

    return (
        <div className="space-y-3">
            {/* Language & Country */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <div className="flex items-center h-6">
                        <Label htmlFor="setup-lang">{t(lang, "language")}</Label>
                    </div>
                    <Select value={setupLang} onValueChange={handleLanguageChange}>
                        <SelectTrigger id="setup-lang"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="EN">English</SelectItem>
                            <SelectItem value="FR">Français</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2 h-6">
                        <Label htmlFor="setup-country">{t(lang, "country")}</Label>
                        <Popover>
                            <PopoverTrigger>
                                <Info className="h-4 w-4 text-slate-400 cursor-pointer" />
                            </PopoverTrigger>
                            <PopoverContent className="w-80 p-4">
                                <h4 className="font-semibold mb-2">{t(lang, "holidayInfoTitle")}</h4>
                                <p className="text-sm text-slate-500 mb-2">{t(lang, "holidayInfoIntro")}</p>
                                <p className="text-xs text-slate-400 italic">{t(lang, "holidayInfoHint")}</p>
                            </PopoverContent>
                        </Popover>
                    </div>
                    <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger id="setup-country"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Object.keys(COUNTRY_TIMEZONE || {}).map(c => (
                                <SelectItem key={c} value={c}>
                                    {COUNTRY_NAMES[c] || c}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Display Mode & Theme */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="display-mode">{t(lang, "displayMode")}</Label>
                    <Select value={displayMode} onValueChange={setDisplayMode}>
                        <SelectTrigger id="display-mode"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="light">{t(lang, "displayModeLight")}</SelectItem>
                            <SelectItem value="dark">{t(lang, "displayModeDark")}</SelectItem>
                            <SelectItem value="system">{t(lang, "displayModeSystem")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="theme-select">{t(lang, "theme")}</Label>
                    <Select value={theme} onValueChange={(val) => { setTheme(val); applyTheme(val); }}>
                        <SelectTrigger id="theme-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {Object.values(THEMES).map(t => (
                                <SelectItem key={t.name} value={t.name}>
                                    {t.label[lang] || t.label.EN}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* App Title & Subtitle */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label htmlFor="app-title">{t(lang, "appTitle")}</Label>
                    <Input id="app-title" value={appTitle} onChange={e => setAppTitle(e.target.value)} placeholder="Taskmaster" />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="app-subtitle">{t(lang, "appSubtitle")}</Label>
                    <Input id="app-subtitle" value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="Company" />
                </div>
            </div>

            {/* Logo & Favicon */}
            <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                    <Label>{t(lang, "logo")}</Label>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => logoInputRef.current?.click()}
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            {t(lang, "chooseFile")}
                        </Button>
                        <span className="text-sm text-slate-500 truncate max-w-[150px]">
                            {logoFile ? logoFile.name : t(lang, "noFileChosen")}
                        </span>
                        <Input
                            ref={logoInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => setLogoFile(e.target.files[0])}
                        />
                    </div>
                </div>
                <div className="space-y-1.5">
                    <Label>{t(lang, "favicon")}</Label>
                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => favInputRef.current?.click()}
                        >
                            <Upload className="mr-2 h-4 w-4" />
                            {t(lang, "chooseFile")}
                        </Button>
                        <span className="text-sm text-slate-500 truncate max-w-[150px]">
                            {favFile ? favFile.name : t(lang, "noFileChosen")}
                        </span>
                        <Input
                            ref={favInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={e => setFavFile(e.target.files[0])}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
