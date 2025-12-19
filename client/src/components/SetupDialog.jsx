import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t, I18N, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { setAuthToken } from "@/lib/api";
import { Upload } from "lucide-react";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import { THEMES, applyTheme } from "@/lib/themes";

export function SetupDialog({ isOpen, onClose, lang }) {
    // Tabs: 'general', 'email', 'export', 'security'
    const [tab, setTab] = useState('general');

    const logoInputRef = useRef(null);
    const favInputRef = useRef(null);

    // Security
    const [adminPwd, setAdminPwd] = useState("");
    const [userPwd, setUserPwd] = useState("");

    // General
    const [appTitle, setAppTitle] = useState("");
    const [appSubtitle, setAppSubtitle] = useState("");
    const [setupLang, setSetupLang] = useState(lang || "EN");
    const [country, setCountry] = useState("FR");
    const [theme, setTheme] = useState("blue");
    const [displayMode, setDisplayMode] = useState("system");
    const [logoFile, setLogoFile] = useState(null);
    const [favFile, setFavFile] = useState(null);

    // Email
    const [mailEnabled, setMailEnabled] = useState(false);
    const [smtpHost, setSmtpHost] = useState("");
    const [smtpPort, setSmtpPort] = useState("587");
    const [smtpUser, setSmtpUser] = useState("");
    const [smtpPass, setSmtpPass] = useState("");
    const [smtpSecure, setSmtpSecure] = useState(false);
    const [mailFrom, setMailFrom] = useState("");
    const [mailTo, setMailTo] = useState("");
    const [mailMissing, setMailMissing] = useState(true);

    // Export
    const [exportEnabled, setExportEnabled] = useState(false);
    const [exportMode, setExportMode] = useState("day"); // day, week, month, custom
    const [exportDir, setExportDir] = useState("./exports");
    const [exportFormatCsv, setExportFormatCsv] = useState(true);
    const [exportFormatPdf, setExportFormatPdf] = useState(true);
    const [exportOffsetFrom, setExportOffsetFrom] = useState(0);
    const [exportOffsetTo, setExportOffsetTo] = useState(0);
    const [exportRetention, setExportRetention] = useState(0);

    const [exportTime, setExportTime] = useState("19:30");
    const [exportDayOfWeek, setExportDayOfWeek] = useState("5"); // 5=Friday, default for weekly

    // Advanced Monthly State
    const [exportMonthlyMode, setExportMonthlyMode] = useState("last"); // last, specific, relative
    const [exportMonthlyDay, setExportMonthlyDay] = useState("1"); // 1-31
    const [exportMonthlyRank, setExportMonthlyRank] = useState("1"); // 1, 2, 3, 4, L (Last)
    const [exportMonthlyDow, setExportMonthlyDow] = useState("5"); // 0-6 (Friday default)

    const [exportCustomCron, setExportCustomCron] = useState("");
    const [cronPreview, setCronPreview] = useState(null);
    const [debouncedCron, setDebouncedCron] = useState("");

    // Mail Export
    const [mailExportEnabled, setMailExportEnabled] = useState(false);
    const [mailExportCsv, setMailExportCsv] = useState(false);
    const [mailExportPdf, setMailExportPdf] = useState(false);

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    // Password Dialog state
    const [showPwdDialog, setShowPwdDialog] = useState(false);
    const [pwdTarget, setPwdTarget] = useState(""); // "admin" or "user"

    // Cron Logic
    const effectiveCron = useMemo(() => {
        if (exportMode === "custom") return exportCustomCron;

        const [hr, min] = (exportTime || "19:30").split(":");
        const parsedHr = parseInt(hr);
        const parsedMin = parseInt(min);
        const sHr = String(isNaN(parsedHr) ? 19 : parsedHr);
        const sMin = String(isNaN(parsedMin) ? 30 : parsedMin);

        if (exportMode === "week") {
            // min hr * * dow
            let dow = exportDayOfWeek;
            return `${sMin} ${sHr} * * ${dow}`;
        } else if (exportMode === "month") {
            // min hr dom * dow
            if (exportMonthlyMode === "last") {
                return `${sMin} ${sHr} 28-31 * *`;
            } else if (exportMonthlyMode === "specific") {
                return `${sMin} ${sHr} ${parseInt(exportMonthlyDay) || 1} * *`;
            } else {
                // relative
                const r = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank}`;
                const suffix = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank}`;
                return `${sMin} ${sHr} * * ${exportMonthlyDow}${suffix}`;
            }
        } else {
            // day
            return `${sMin} ${sHr} * * *`;
        }
    }, [exportMode, exportTime, exportDayOfWeek, exportMonthlyMode, exportMonthlyDay, exportMonthlyRank, exportMonthlyDow, exportCustomCron]);

    // Debounce preview fetch
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedCron(effectiveCron);
        }, 500);
        return () => clearTimeout(timer);
    }, [effectiveCron]);

    useEffect(() => {
        if (!debouncedCron) return;

        async function fetchPreview() {
            try {
                // Public endpoint, no token needed
                const res = await fetch("/api/cron-preview", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cron: debouncedCron, country })
                });
                const d = await res.json();
                setCronPreview(d);
            } catch (e) {
                console.error("Preview fetch error", e);
            }
        }
        fetchPreview();
    }, [debouncedCron, country]);


    const handleSubmit = async (e) => {
        e.preventDefault();

        // Strict password validation
        if (!adminPwd || adminPwd.trim().length === 0) {
            setError("Admin/User password are required. Please set it in the Security tab.");
            setTab('security');
            return;
        }
        if (!userPwd || userPwd.trim().length === 0) {
            setError("User password is required. Please set it in the Security tab.");
            setTab('security');
            return;
        }
        if (adminPwd.length < 3) {
            setError("Admin password must be at least 3 characters long.");
            setTab('security');
            return;
        }
        if (userPwd.length < 3) {
            setError("User password must be at least 3 characters long.");
            setTab('security');
            return;
        }

        setLoading(true);
        setError("");

        try {
            const fd = new FormData();
            // Security
            fd.append("admin_password", adminPwd);
            fd.append("user_password", userPwd);

            // General
            if (appTitle) fd.append("title", appTitle);
            if (appSubtitle) fd.append("subtitle", appSubtitle);
            fd.append("lang", setupLang);
            fd.append("country", country);
            fd.append("theme", theme);
            fd.append("display_mode", displayMode);
            if (logoFile) fd.append("logo_file", logoFile);
            if (favFile) fd.append("favicon_file", favFile);

            // Email
            fd.append("mail_enabled", mailEnabled ? "1" : "0");
            if (smtpHost) fd.append("smtp_host", smtpHost);
            if (smtpPort) fd.append("smtp_port", smtpPort);
            fd.append("smtp_secure", smtpSecure ? "1" : "0");
            if (smtpUser) fd.append("smtp_user", smtpUser);
            if (smtpPass) fd.append("smtp_pass", smtpPass);
            if (mailFrom) fd.append("mail_from", mailFrom);
            if (mailTo) fd.append("mail_to", mailTo);
            fd.append("mail_missing_enabled", mailMissing ? "1" : "0");

            // Export
            fd.append("auto_export_enabled", exportEnabled ? "1" : "0");
            fd.append("auto_export_mode", exportMode);
            fd.append("auto_export_cron", effectiveCron);

            fd.append("export_dir", exportDir);
            fd.append("auto_export_from_offset_days", String(exportOffsetFrom));
            fd.append("auto_export_to_offset_days", String(exportOffsetTo));
            fd.append("export_retention_days", String(exportRetention));

            fd.append("export_format_csv", exportFormatCsv ? "1" : "0");
            fd.append("export_format_pdf", exportFormatPdf ? "1" : "0");

            // Mail Export settings
            fd.append("mail_export_enabled", mailExportEnabled ? "1" : "0");
            fd.append("mail_export_format_csv", mailExportCsv ? "1" : "0");
            fd.append("mail_export_format_pdf", mailExportPdf ? "1" : "0");

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
        <Dialog open={isOpen} onOpenChange={() => { }}>
            <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
                onPointerDownOutside={e => e.preventDefault()}
                onEscapeKeyDown={e => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>{t(setupLang, "setupTitle")}</DialogTitle>
                </DialogHeader>

                {/* Custom Tabs Header */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
                    <TabButton id="general" label="General" />
                    <TabButton id="email" label="Email" />
                    <TabButton id="export" label="Export" />
                    <TabButton id="security" label={t(setupLang, "security")} />
                </div>

                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 px-1">
                    {tab === 'general' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t(setupLang, "language")}</Label>
                                    <Select value={setupLang} onValueChange={setSetupLang}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="EN">English</SelectItem>
                                            <SelectItem value="FR">Français</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t(setupLang, "country")}</Label>
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
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
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
                                <div className="space-y-2">
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
                            <div className="space-y-2">
                                <Label>{t(setupLang, "appTitle")}</Label>
                                <Input value={appTitle} onChange={e => setAppTitle(e.target.value)} placeholder="Taskmaster" />
                            </div>
                            <div className="space-y-2">
                                <Label>{t(setupLang, "appSubtitle")}</Label>
                                <Input value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="Company" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
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
                                <div className="space-y-2">
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
                            <p className="text-sm text-slate-500 mb-4">Define the passwords for the two default roles.</p>

                            <div className="space-y-2">
                                <Label className="text-rose-600 dark:text-rose-400">{t(setupLang, "setupAdminPwd")} *</Label>
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => { setPwdTarget("admin"); setShowPwdDialog(true); }}
                                        className="flex-1"
                                    >
                                        {adminPwd ? `✓ ${t(setupLang, "pwdChanged")}` : t(setupLang, "changePwd")}
                                    </Button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>{t(setupLang, "setupUserPwd")} *</Label>
                                <div className="flex items-center gap-3">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => { setPwdTarget("user"); setShowPwdDialog(true); }}
                                        className="flex-1"
                                    >
                                        {userPwd ? `✓ ${t(setupLang, "pwdChanged")}` : t(setupLang, "changePwd")}
                                    </Button>
                                </div>
                            </div>

                            {/* Password Change Dialog */}
                            <PasswordChangeDialog
                                isOpen={showPwdDialog}
                                onClose={() => setShowPwdDialog(false)}
                                lang={setupLang}
                                onSave={(newPwd) => {
                                    if (pwdTarget === "admin") {
                                        setAdminPwd(newPwd);
                                    } else {
                                        setUserPwd(newPwd);
                                    }
                                    setShowPwdDialog(false);
                                }}
                            />
                        </div>
                    )}

                    {tab === 'email' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>{t(setupLang, "emailNotifLegend")}</Label>
                                <Switch checked={mailEnabled} onCheckedChange={setMailEnabled} />
                            </div>
                            {mailEnabled && (
                                <>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "smtpHost")}</Label>
                                            <Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "smtpPort")}</Label>
                                            <Input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} id="secure" />
                                        <Label htmlFor="secure">{t(setupLang, "smtpSecure")}</Label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "smtpUser")}</Label>
                                            <Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "smtpPass")}</Label>
                                            <Input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "mailFrom")}</Label>
                                            <Input value={mailFrom} onChange={e => setMailFrom(e.target.value)} placeholder="Taskmaster <no-reply@...>" />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "mailTo")}</Label>
                                            <Input value={mailTo} onChange={e => setMailTo(e.target.value)} placeholder="admin@example.com" />
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch checked={mailMissing} onCheckedChange={setMailMissing} id="missing" />
                                        <Label htmlFor="missing">{t(setupLang, "emailMissingEnable")}</Label>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {tab === 'export' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label>{t(setupLang, "autoExportLegend")}</Label>
                                <Switch checked={exportEnabled} onCheckedChange={setExportEnabled} />
                            </div>

                            {exportEnabled && (
                                <>
                                    {/* Formats */}
                                    <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                        <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t(setupLang, "exportFormats")}</Label>
                                        <div className="flex items-center gap-6">
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="ex-csv"
                                                    checked={exportFormatCsv}
                                                    onCheckedChange={setExportFormatCsv}
                                                    disabled={!exportEnabled && !mailExportEnabled}
                                                />
                                                <Label htmlFor="ex-csv" className="font-normal cursor-pointer">CSV</Label>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Switch
                                                    id="ex-pdf"
                                                    checked={exportFormatPdf}
                                                    onCheckedChange={setExportFormatPdf}
                                                    disabled={!exportEnabled && !mailExportEnabled}
                                                />
                                                <Label htmlFor="ex-pdf" className="font-normal cursor-pointer">PDF</Label>
                                            </div>
                                        </div>
                                        {!exportFormatCsv && !exportFormatPdf && (
                                            <p className="text-xs text-amber-600 font-medium mt-1">
                                                {t(setupLang, "exportFormatMissing")}
                                            </p>
                                        )}
                                    </div>

                                    <div className="space-y-4">
                                        <div className="flex gap-4">
                                            <div className="flex-1 space-y-2">
                                                <Label>{t(setupLang, "autoExportFreq")}</Label>
                                                <Select value={exportMode} onValueChange={setExportMode}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="day">{t(setupLang, "autoExportFreqDaily")}</SelectItem>
                                                        <SelectItem value="week">{t(setupLang, "autoExportFreqWeekly")}</SelectItem>
                                                        <SelectItem value="month">{t(setupLang, "autoExportFreqMonthly")}</SelectItem>
                                                        <SelectItem value="custom">Custom (Cron)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            {exportMode !== "custom" && (
                                                <div className="w-32 space-y-2">
                                                    <Label>{t(setupLang, "exportTime")}</Label>
                                                    <Input type="time" value={exportTime} onChange={e => setExportTime(e.target.value)} />
                                                </div>
                                            )}
                                        </div>

                                        {exportMode === "week" && (
                                            <div className="w-full space-y-2">
                                                <Label>{t(setupLang, "exportDayOfWeek")}</Label>
                                                <Select value={exportDayOfWeek} onValueChange={setExportDayOfWeek}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">{t(setupLang, "dayMon")}</SelectItem>
                                                        <SelectItem value="2">{t(setupLang, "dayTue")}</SelectItem>
                                                        <SelectItem value="3">{t(setupLang, "dayWed")}</SelectItem>
                                                        <SelectItem value="4">{t(setupLang, "dayThu")}</SelectItem>
                                                        <SelectItem value="5">{t(setupLang, "dayFri")}</SelectItem>
                                                        <SelectItem value="6">{t(setupLang, "daySat")}</SelectItem>
                                                        <SelectItem value="0">{t(setupLang, "daySun")}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        )}

                                        {exportMode === "month" && (
                                            <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
                                                <div className="flex items-center gap-4">
                                                    <Switch checked={exportMonthlyMode === "last"} onCheckedChange={(c) => setExportMonthlyMode(c ? "last" : "specific")} id="last_day" />
                                                    <Label htmlFor="last_day" className="whitespace-nowrap font-medium">{t(setupLang, "exLastDayOfMonth")}</Label>
                                                </div>

                                                {exportMonthlyMode !== "last" && (
                                                    <div className="space-y-3 pt-2 pl-2 border-l-2 border-slate-200 dark:border-slate-800 ml-2">
                                                        <div className="flex gap-4">
                                                            <div className="w-1/2 space-y-2">
                                                                <Label>Type</Label>
                                                                <Select value={exportMonthlyMode} onValueChange={setExportMonthlyMode}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="specific">{t(setupLang, "monthlyTypeSpecific")}</SelectItem>
                                                                        <SelectItem value="relative">{t(setupLang, "monthlyTypeRelative")}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="w-1/2 flex items-end">
                                                                {exportMonthlyMode === "specific" ? (
                                                                    <div className="space-y-2 w-full">
                                                                        <Label>{t(setupLang, "exDayOfMonth")} (1-31)</Label>
                                                                        <Input type="number" min="1" max="31" value={exportMonthlyDay} onChange={e => setExportMonthlyDay(e.target.value)} />
                                                                    </div>
                                                                ) : (
                                                                    <div className="space-y-2 w-full">
                                                                        <Label>{t(setupLang, "rankFirst")}...</Label>
                                                                        <Select value={exportMonthlyRank} onValueChange={setExportMonthlyRank}>
                                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="1">{t(setupLang, "rankFirst")}</SelectItem>
                                                                                <SelectItem value="2">{t(setupLang, "rankSecond")}</SelectItem>
                                                                                <SelectItem value="3">{t(setupLang, "rankThird")}</SelectItem>
                                                                                <SelectItem value="4">{t(setupLang, "rankFourth")}</SelectItem>
                                                                                <SelectItem value="L">{t(setupLang, "rankLast")}</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>

                                                        {exportMonthlyMode === "relative" && (
                                                            <div className="space-y-2">
                                                                <Label>{t(setupLang, "exportDayOfWeek")}</Label>
                                                                <Select value={exportMonthlyDow} onValueChange={setExportMonthlyDow}>
                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="1">{t(setupLang, "dayMon")}</SelectItem>
                                                                        <SelectItem value="2">{t(setupLang, "dayTue")}</SelectItem>
                                                                        <SelectItem value="3">{t(setupLang, "dayWed")}</SelectItem>
                                                                        <SelectItem value="4">{t(setupLang, "dayThu")}</SelectItem>
                                                                        <SelectItem value="5">{t(setupLang, "dayFri")}</SelectItem>
                                                                        <SelectItem value="6">{t(setupLang, "daySat")}</SelectItem>
                                                                        <SelectItem value="0">{t(setupLang, "daySun")}</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {exportMode === "custom" && (
                                            <div className="space-y-2">
                                                <Label>Cron Expression</Label>
                                                <Input value={exportCustomCron} onChange={e => setExportCustomCron(e.target.value)} placeholder="30 19 * * *" className="font-mono" />
                                                <div className="text-xs text-slate-500">min hour day month dow</div>
                                            </div>
                                        )}

                                        <div className="text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                                            {cronPreview?.valid ? (
                                                <>
                                                    <span className="font-semibold text-primary">{effectiveCron}</span>
                                                    <span className="mx-2">&rarr;</span>
                                                    <span>{new Date(cronPreview.next).toLocaleString(setupLang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'long', timeStyle: 'short' })}</span>
                                                </>
                                            ) : (
                                                <span className="text-red-500">
                                                    {cronPreview?.error || t(setupLang, "loading")}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>{t(setupLang, "exportDir")}</Label>
                                        <Input value={exportDir} onChange={e => setExportDir(e.target.value)} />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "offsetFrom")}</Label>
                                            <Input type="number" min="0" value={exportOffsetFrom} onChange={e => setExportOffsetFrom(parseInt(e.target.value) || 0)} />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>{t(setupLang, "offsetTo")}</Label>
                                            <Input type="number" min="0" value={exportOffsetTo} onChange={e => setExportOffsetTo(parseInt(e.target.value) || 0)} />
                                        </div>
                                    </div>

                                    <div className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-900 p-2 rounded">
                                        <p><strong>{t(setupLang, 'preview')}:</strong> {t(setupLang, 'previewIntro')}</p>
                                        <p className="font-mono mt-1">
                                            {t(setupLang, 'from')} {new Date(Date.now() - (exportOffsetFrom * 86400000)).toLocaleDateString(setupLang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })} <br />
                                            {t(setupLang, 'to')} {new Date(Date.now() - (exportOffsetTo * 86400000)).toLocaleDateString(setupLang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })}
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label>{t(setupLang, "cleanupRetentionLabel")}</Label>
                                        <Select value={String(exportRetention)} onValueChange={v => setExportRetention(parseInt(v) || 0)}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="0">{t(setupLang, "retentionNever")}</SelectItem>
                                                <SelectItem value="30">{t(setupLang, "retention1Month")}</SelectItem>
                                                <SelectItem value="180">{t(setupLang, "retention6Months")}</SelectItem>
                                                <SelectItem value="365">{t(setupLang, "retention1Year")}</SelectItem>
                                                <SelectItem value="3650">{t(setupLang, "retention10Years")}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-4 mt-4">
                                        <div className="flex flex-col">
                                            <Label>{t(setupLang, "emailExportLegend")}</Label>
                                            <span className="text-xs text-slate-500">{t(setupLang, "emailExportSub")}</span>
                                        </div>
                                        <Switch checked={mailExportEnabled} onCheckedChange={setMailExportEnabled} disabled={!mailEnabled} />
                                    </div>

                                    {mailExportEnabled && (
                                        <div className="flex flex-col gap-2 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800">
                                            <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">{t(setupLang, "emailExportFormats")}</Label>
                                            <div className="flex items-center gap-6">
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        id="me-csv"
                                                        checked={mailExportCsv}
                                                        onCheckedChange={setMailExportCsv}
                                                    />
                                                    <Label htmlFor="me-csv" className="font-normal cursor-pointer">CSV</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch
                                                        id="me-pdf"
                                                        checked={mailExportPdf}
                                                        onCheckedChange={setMailExportPdf}
                                                    />
                                                    <Label htmlFor="me-pdf" className="font-normal cursor-pointer">PDF</Label>
                                                </div>
                                            </div>
                                            {!mailExportCsv && !mailExportPdf && (
                                                <p className="text-xs text-amber-600 font-medium mt-1">
                                                    {t(setupLang, "exportFormatMissing")}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </>
                            )}
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
                                disabled={loading || !adminPwd || !userPwd || adminPwd.length < 3 || userPwd.length < 3}
                            >
                                {loading ? "..." : t(setupLang, "setupSubmit")}
                            </Button>
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
