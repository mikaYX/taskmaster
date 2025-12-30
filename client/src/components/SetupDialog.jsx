import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { Upload } from "lucide-react";
import { THEMES, applyTheme } from "@/lib/themes";
import { PasswordChangeDialog } from "./PasswordChangeDialog";

export function SetupDialog({ isOpen, onClose, lang }) {
    // Tabs: only 'general' and 'security'
    const [tab, setTab] = useState('general');

    const logoInputRef = useRef(null);
    const favInputRef = useRef(null);

    // General
    const [appTitle, setAppTitle] = useState("");
    const [appSubtitle, setAppSubtitle] = useState("");
    const [setupLang, setSetupLang] = useState(lang || "EN");
    const [country, setCountry] = useState("FR");
    const [theme, setTheme] = useState("blue");
    const [displayMode, setDisplayMode] = useState("system");
    const [logoFile, setLogoFile] = useState(null);
    const [favFile, setFavFile] = useState(null);

    // Security - Admin Password
    const [adminPwd, setAdminPwd] = useState("");
    const [showPwdDialog, setShowPwdDialog] = useState(false);

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Validate admin password
        if (!adminPwd) {
            setError(t(setupLang, "adminPwdRequired"));
            setTab('security');
            return;
        }

        setLoading(true);
        setError("");

        try {
            const fd = new FormData();

            // General
            if (appTitle) fd.append("title", appTitle);
            if (appSubtitle) fd.append("subtitle", appSubtitle);
            fd.append("lang", setupLang);
            fd.append("country", country);
            fd.append("theme", theme);
            fd.append("display_mode", displayMode);
            if (logoFile) fd.append("logo_file", logoFile);
            if (favFile) fd.append("favicon_file", favFile);

            // Security - Admin Password
            fd.append("admin_password", adminPwd);

            // We use raw fetch for FormData
            const res = await fetch("/api/setup", {
                method: "POST",
                body: fd
            });

            if (res.ok) {
                onClose();
                window.location.reload();
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.error || "Setup failed");
            }
        } catch (e) {
            setError("Network error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const TabButton = ({ id, label }) => (
        <button
            type="button"
            onClick={() => setTab(id)}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
        >
            {label}
        </button>
    );

    return (
        <>
            <Dialog open={isOpen} onOpenChange={() => { }}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
                    onPointerDownOutside={e => e.preventDefault()}
                    onEscapeKeyDown={e => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{t(setupLang, "setupTitle")}</DialogTitle>
                        <DialogDescription className="hidden">Initial Application Setup</DialogDescription>
                    </DialogHeader>

                    {/* Custom Tabs Header */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
                        <TabButton id="general" label="General" />
                        <TabButton id="security" label={t(setupLang, "security")} />
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 px-1">
                        {tab === 'general' && (
                            <div className="space-y-3">
                                {/* Language & Country */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <div className="flex items-center h-6">
                                            <Label>{t(setupLang, "language")}</Label>
                                        </div>
                                        <Select value={setupLang} onValueChange={setSetupLang}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EN">English</SelectItem>
                                                <SelectItem value="FR">Français</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex items-center h-6">
                                            <Label>{t(setupLang, "country")}</Label>
                                        </div>
                                        <Select value={country} onValueChange={setCountry}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
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
                                        <Label>{t(setupLang, "displayMode")}</Label>
                                        <Select value={displayMode} onValueChange={setDisplayMode}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="light">{t(setupLang, "displayModeLight")}</SelectItem>
                                                <SelectItem value="dark">{t(setupLang, "displayModeDark")}</SelectItem>
                                                <SelectItem value="system">{t(setupLang, "displayModeSystem")}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{t(setupLang, "theme")}</Label>
                                        <Select value={theme} onValueChange={(val) => { setTheme(val); applyTheme(val); }}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                {Object.values(THEMES).map(t => (
                                                    <SelectItem key={t.name} value={t.name}>
                                                        {t.label[setupLang] || t.label.EN}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {/* App Title & Subtitle */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>{t(setupLang, "appTitle")}</Label>
                                        <Input value={appTitle} onChange={e => setAppTitle(e.target.value)} placeholder="Taskmaster" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label>{t(setupLang, "appSubtitle")}</Label>
                                        <Input value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="Company" />
                                    </div>
                                </div>

                                {/* Logo & Favicon */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label>{t(setupLang, "logo")}</Label>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => logoInputRef.current?.click()}
                                            >
                                                <Upload className="mr-2 h-4 w-4" />
                                                {t(setupLang, "chooseFile")}
                                            </Button>
                                            <span className="text-sm text-slate-500 truncate max-w-[150px]">
                                                {logoFile ? logoFile.name : t(setupLang, "noFileChosen")}
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
                                        <Label>{t(setupLang, "favicon")}</Label>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => favInputRef.current?.click()}
                                            >
                                                <Upload className="mr-2 h-4 w-4" />
                                                {t(setupLang, "chooseFile")}
                                            </Button>
                                            <span className="text-sm text-slate-500 truncate max-w-[150px]">
                                                {favFile ? favFile.name : t(setupLang, "noFileChosen")}
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
                        )}

                        {tab === 'security' && (
                            <div className="space-y-4">
                                <p className="text-sm text-slate-500 mb-4">{t(setupLang, "setupAdminPwdMsg")}</p>
                                <div className="space-y-2">
                                    <Label className="text-rose-600 dark:text-rose-400">{t(setupLang, "setupAdminPwd")} *</Label>
                                    <div className="flex items-center gap-3">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setShowPwdDialog(true)}
                                            className="flex-1"
                                        >
                                            {adminPwd ? `✓ ${t(setupLang, "pwdChanged")}` : t(setupLang, "changePwd")}
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}
                    </form>

                    <DialogFooter className="border-t border-slate-200 dark:border-slate-800 pt-4 shrink-0">
                        <div className="flex flex-col w-full gap-4">
                            {error && (
                                <div className="text-sm font-medium text-destructive text-center bg-destructive/10 p-2 rounded-md border border-destructive/20">
                                    {error}
                                </div>
                            )}
                            <div className="flex items-center justify-between gap-4">
                                <p className="text-xs text-muted-foreground italic flex-1 text-left">
                                    {t(setupLang, "setupHint")}
                                </p>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={loading}
                                >
                                    {loading ? "..." : t(setupLang, "setupSubmit")}
                                </Button>
                            </div>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <PasswordChangeDialog
                isOpen={showPwdDialog}
                onClose={() => setShowPwdDialog(false)}
                lang={setupLang}
                title={t(setupLang, "setupAdminPwd")}
                onSave={(pwd) => {
                    setAdminPwd(pwd);
                    setShowPwdDialog(false);
                }}
            />
        </>
    );
}
