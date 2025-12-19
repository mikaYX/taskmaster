import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t, I18N, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { apiFetch } from "@/lib/api";
import { Upload, Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import { THEMES, applyTheme } from "@/lib/themes";

export function SettingsDialog({ isOpen, onClose, lang, onConfigChange }) {
    const { toast } = useToast();
    // Tabs: 'general', 'email', 'export'
    const [tab, setTab] = useState('general');

    // General
    const [appTitle, setAppTitle] = useState("");
    const [appSubtitle, setAppSubtitle] = useState("");
    const [setupLang, setSetupLang] = useState("EN");
    const [country, setCountry] = useState("FR");
    const [theme, setTheme] = useState("blue");
    const [displayMode, setDisplayMode] = useState("system");
    const [logoFile, setLogoFile] = useState(null);
    const [favFile, setFavFile] = useState(null);

    // Security
    const [adminPwd, setAdminPwd] = useState("");
    const [userPwd, setUserPwd] = useState("");
    const [showPwdDialog, setShowPwdDialog] = useState(false);
    const [pwdTarget, setPwdTarget] = useState(null); // 'admin' | 'user'

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

    const [mailExportEnabled, setMailExportEnabled] = useState(false);
    const [mailExportCsv, setMailExportCsv] = useState(false);
    const [mailExportPdf, setMailExportPdf] = useState(false);

    // Export
    const [exportEnabled, setExportEnabled] = useState(false);
    const [exportMode, setExportMode] = useState("daily"); // day, week, month_to_date, custom
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

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [originalSettings, setOriginalSettings] = useState(null);

    const logoInputRef = useRef(null);
    const favInputRef = useRef(null);

    // Confirmation State
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'mail' | 'export' | 'export-mail'
    const [confirmMessage, setConfirmMessage] = useState("");

    // Load initial config
    useEffect(() => {
        if (isOpen) {
            loadSettings();
        }
    }, [isOpen]);

    const loadSettings = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/config");
            const data = await res.json();

            setAppTitle(data.title || "");
            setAppSubtitle(data.subtitle || "");
            setSetupLang(data.lang || "EN");
            setCountry(data.country || "FR");
            setTheme(data.theme || "blue");
            setDisplayMode(data.display_mode || "system");

            setMailEnabled(!!data.mail_enabled);
            setSmtpHost(data.smtp_host || "");
            setSmtpPort(data.smtp_port || "587");
            setSmtpUser(data.smtp_user || "");
            setSmtpPass(data.smtp_pass ? "••••••••" : "");
            setSmtpSecure(!!data.smtp_secure);
            setMailFrom(data.mail_from || "");
            setMailTo(data.mail_to || "");
            setMailMissing(data.mail_missing_enabled !== false);

            setMailExportEnabled(!!data.mail_export_enabled);
            setMailExportCsv(!!data.mail_export_format_csv);
            setMailExportPdf(!!data.mail_export_format_pdf);

            setExportEnabled(!!data.auto_export_enabled);
            setExportMode(data.auto_export_mode || "day");
            setExportDir(data.export_dir || "./exports");
            setExportFormatCsv(data.export_format_csv !== false);
            setExportFormatPdf(data.export_format_pdf !== false);
            setExportOffsetFrom(data.auto_export_from_offset_days || 0);
            setExportOffsetTo(data.auto_export_to_offset_days || 0);
            setExportRetention(data.export_retention_days || 0);

            // Parse cron: "min hr day month dow"
            // Default "30 19 * * *"
            const cronParts = (data.auto_export_cron || "30 19 * * *").split(" ");
            const min = (cronParts[0] || "30").padStart(2, "0");
            const hr = (cronParts[1] || "19").padStart(2, "0");
            const dom = cronParts[2] || "*";
            const dowPart = cronParts[4] || "*";

            setExportTime(`${hr}:${min}`);
            setExportCustomCron(data.auto_export_cron || "30 19 * * *");

            // Weekly parsing
            const weeklyDow = dowPart === "*" ? "5" : (dowPart.includes("#") || dowPart.includes("L") ? "5" : dowPart);
            setExportDayOfWeek(weeklyDow);

            // Monthly parsing
            let mMode = "last";
            let mDay = "1";
            let mRank = "1";
            let mDow = "5";

            if (dom === "28-31") {
                mMode = "last";
            } else if (dom !== "*") {
                mMode = "specific";
                mDay = dom;
            } else {
                // dom is *, check dow
                if (dowPart.includes("#")) {
                    mMode = "relative";
                    const [d, r] = dowPart.split("#");
                    mDow = d;
                    mRank = r;
                } else if (dowPart.includes("L")) {
                    mMode = "relative";
                    const [d] = dowPart.split("L");
                    mDow = d;
                    mRank = "L"; // L for Last
                } else if (dowPart !== "*") {
                    // Just a day? Treat as relative 1st? or specific? 
                    // If it's * * * * 5, Node cron usually means EVERY Friday.
                    // But in "Monthly" context we want one exec.
                    // Let's verify existing. If existing was `* * * * 5` but mode was `month`, that implies weekly.
                    // Assuming we default to rank 1.
                    mMode = "relative";
                    mDow = dowPart;
                    mRank = "1";
                }
            }

            setExportMonthlyMode(mMode);
            setExportMonthlyDay(mDay);
            setExportMonthlyRank(mRank);
            setExportMonthlyDow(mDow);

            // Store parsed values in originalSettings for proper diffing
            setOriginalSettings({
                ...data,
                _exportTime: `${hr}:${min}`,
                _exportDayOfWeek: weeklyDow,
                _exportMonthlyMode: mMode,
                _exportMonthlyDay: mDay,
                _exportMonthlyRank: mRank,
                _exportMonthlyDow: mDow,
                _exportCustomCron: data.auto_export_cron
            });

        } catch (e) {
            console.error("Failed to load settings", e);
            setError("Failed to load settings");
        } finally {
            setLoading(false);
        }
    };

    // Calculate effective cron
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
                // If rank is L, syntax is 5L. If rank is N, 5#N.
                // NOTE: node-cron supports 5L (last Friday).
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
                const token = localStorage.getItem("checklist_auth_token");
                const res = await fetch("/api/cron-preview", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
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


    // Check for changes
    const hasChanges = useMemo(() => {
        if (!originalSettings) return false;

        const eq = (a, b) => String(a || "") === String(b || "");
        const eqBool = (a, b) => !!a === !!b;
        const eqBoolTrue = (curr, orig) => curr === (orig !== false);

        return (
            !eq(appTitle, originalSettings.title) ||
            !eq(appSubtitle, originalSettings.subtitle) ||
            !eq(setupLang, originalSettings.lang) ||
            !eq(country, originalSettings.country) ||
            !eq(theme, originalSettings.theme) ||
            !eq(displayMode, originalSettings.display_mode) ||
            !eqBool(mailEnabled, originalSettings.mail_enabled) ||
            !eq(smtpHost, originalSettings.smtp_host) ||
            !eq(smtpPort, originalSettings.smtp_port) ||
            !eq(smtpUser, originalSettings.smtp_user) ||
            !eq(smtpPass, originalSettings.smtp_pass) ||
            !eqBool(smtpSecure, originalSettings.smtp_secure) ||
            !eq(mailFrom, originalSettings.mail_from) ||
            !eq(mailTo, originalSettings.mail_to) ||
            !eqBool(mailMissing, originalSettings.mail_missing_enabled) ||
            !eqBool(mailExportEnabled, originalSettings.mail_export_enabled) ||
            !eqBoolTrue(mailExportCsv, originalSettings.mail_export_format_csv) ||
            !eqBoolTrue(mailExportPdf, originalSettings.mail_export_format_pdf) ||
            !eqBool(exportEnabled, originalSettings.auto_export_enabled) ||
            !eq(exportMode, originalSettings.auto_export_mode) ||
            !eq(exportDir, originalSettings.export_dir) ||
            !eqBoolTrue(exportFormatCsv, originalSettings.export_format_csv) ||
            !eqBoolTrue(exportFormatPdf, originalSettings.export_format_pdf) ||
            !eq(exportOffsetFrom, originalSettings.auto_export_from_offset_days) ||
            !eq(exportOffsetTo, originalSettings.auto_export_to_offset_days) ||
            !eq(exportRetention, originalSettings.export_retention_days) ||
            !eq(exportTime, originalSettings._exportTime) ||
            !eq(exportDayOfWeek, originalSettings._exportDayOfWeek) ||
            !eq(exportMonthlyMode, originalSettings._exportMonthlyMode) ||
            !eq(exportMonthlyDay, originalSettings._exportMonthlyDay) ||
            !eq(exportMonthlyRank, originalSettings._exportMonthlyRank) ||
            !eq(exportMonthlyDow, originalSettings._exportMonthlyDow) ||
            !eq(exportCustomCron, originalSettings._exportCustomCron) ||
            logoFile !== null ||
            favFile !== null
        );
    }, [
        originalSettings, appTitle, appSubtitle, setupLang, country, theme, displayMode,
        mailEnabled, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, mailFrom, mailTo, mailMissing,
        mailExportEnabled, mailExportCsv, mailExportPdf,
        exportEnabled, exportMode, exportDir, exportFormatCsv, exportFormatPdf, exportOffsetFrom, exportOffsetTo, exportRetention,
        exportTime, exportDayOfWeek, exportMonthlyMode, exportMonthlyDay, exportMonthlyRank, exportMonthlyDow, exportCustomCron,
        logoFile, favFile
    ]);

    const isInvalid = useMemo(() => {
        if (mailExportEnabled && !mailExportCsv && !mailExportPdf) return true;
        if (exportEnabled && !exportFormatCsv && !exportFormatPdf) return true;
        // Validate Export Time format? HTML Input type=time ensures HH:MM
        return false;
    }, [mailExportEnabled, mailExportCsv, mailExportPdf, exportEnabled, exportFormatCsv, exportFormatPdf]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isInvalid) return;

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

            // Security
            if (adminPwd) fd.append("admin_password", adminPwd);
            if (userPwd) fd.append("user_password", userPwd);

            // Email
            fd.append("mail_enabled", mailEnabled ? "1" : "0");
            fd.append("smtp_host", smtpHost);
            fd.append("smtp_port", smtpPort);
            fd.append("smtp_secure", smtpSecure ? "1" : "0");
            fd.append("smtp_user", smtpUser);
            if (smtpPass && smtpPass !== "••••••••") fd.append("smtp_pass", smtpPass);
            fd.append("mail_from", mailFrom);
            fd.append("mail_to", mailTo);
            fd.append("mail_missing_enabled", mailMissing ? "1" : "0");

            fd.append("mail_export_enabled", mailExportEnabled ? "1" : "0");
            fd.append("mail_export_format_csv", mailExportCsv ? "1" : "0");
            fd.append("mail_export_format_pdf", mailExportPdf ? "1" : "0");

            // Export
            fd.append("auto_export_enabled", exportEnabled ? "1" : "0");
            fd.append("export_dir", exportDir);
            fd.append("export_format_csv", exportFormatCsv ? "1" : "0");
            fd.append("export_format_pdf", exportFormatPdf ? "1" : "0");
            fd.append("auto_export_from_offset_days", exportOffsetFrom);
            fd.append("auto_export_to_offset_days", exportOffsetTo);
            fd.append("export_retention_days", exportRetention);

            const [hr, min] = (exportTime || "19:30").split(":");
            const parsedHr = parseInt(hr);
            const parsedMin = parseInt(min);
            const sHr = String(isNaN(parsedHr) ? 19 : parsedHr);
            const sMin = String(isNaN(parsedMin) ? 30 : parsedMin);

            if (exportMode === "week") {
                fd.append("auto_export_mode", "week");
                let dow = exportDayOfWeek === "*" ? "5" : exportDayOfWeek;
                fd.append("auto_export_cron", `${sMin} ${sHr} * * ${dow}`);
            } else if (exportMode === "month") {
                fd.append("auto_export_mode", "month_to_date");
                let cronStr = "";
                if (exportMonthlyMode === "last") {
                    cronStr = `${sMin} ${sHr} 28-31 * *`;
                } else if (exportMonthlyMode === "specific") {
                    const dom = parseInt(exportMonthlyDay) || 1;
                    cronStr = `${sMin} ${sHr} ${dom} * *`;
                } else {
                    const suffix = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank}`;
                    cronStr = `${sMin} ${sHr} * * ${exportMonthlyDow}${suffix}`;
                }
                fd.append("auto_export_cron", cronStr);
            } else if (exportMode === "custom") {
                fd.append("auto_export_mode", "custom");
                fd.append("auto_export_cron", exportCustomCron);
            } else {
                fd.append("auto_export_mode", "day");
                fd.append("auto_export_cron", `${sMin} ${sHr} * * *`);
            }

            // Use apiFetch logic but with FormData handled carefully (apiFetch usually adds Content-Type: json)
            // We need to bypass apiFetch or override. 
            // Better to use raw fetch with token
            const token = localStorage.getItem("checklist_auth_token");
            const res = await fetch("/api/settings", {
                method: "POST",
                headers: {
                    "Authorization": "Bearer " + token
                },
                body: fd
            });

            if (res.ok) {
                await loadSettings();
                if (onConfigChange) onConfigChange();
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.error || "Update failed");
            }
        } catch (e) {
            setError("Network error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleTestMail = () => {
        setConfirmAction('mail');
        setConfirmMessage("Send test email?");
        setConfirmOpen(true);
    };

    const handleTestExport = () => {
        setConfirmAction('export');
        setConfirmMessage("Run export now?");
        setConfirmOpen(true);
    };

    const handleTestExportMail = () => {
        setConfirmAction('export-mail');
        setConfirmMessage("Send export by email now?");
        setConfirmOpen(true);
    };

    const executeConfirmAction = async () => {
        setConfirmOpen(false);
        if (!confirmAction) return;

        if (confirmAction === 'mail') {
            setLoading(true);
            toast({ title: t(lang, "loading"), description: "Sending test email..." });
            try {
                const body = {
                    smtp_host: smtpHost,
                    smtp_port: smtpPort,
                    smtp_user: smtpUser,
                    smtp_pass: smtpPass,
                    smtp_secure: smtpSecure,
                    mail_from: mailFrom,
                    mail_to: mailTo
                };
                const token = localStorage.getItem("checklist_auth_token");
                const res = await apiFetch("/api/test-mail", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                const d = await res.json();
                if (d.ok) toast({ title: "Email sent", description: "Email sent successfully!", variant: "default" });
                else toast({ title: "Error", description: d.error, variant: "destructive" });
            } catch (e) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
            } finally {
                setLoading(false);
            }
        } else if (confirmAction === 'export') {
            setLoading(true);
            toast({ title: t(lang, "loading"), description: "Exporting..." });
            try {
                const res = await apiFetch("/api/test-export", { method: "POST" });
                const d = await res.json();
                if (d.ok) toast({ title: "Success", description: "Export executed!", variant: "default" });
                else toast({ title: "Error", description: d.error, variant: "destructive" });
            } catch (e) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
            } finally {
                setLoading(false);
            }
        } else if (confirmAction === 'export-mail') {
            setLoading(true);
            toast({ title: t(lang, "loading"), description: "Sending export email..." });
            try {
                const res = await apiFetch("/api/test-export-mail", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({}) // Use defaults
                });
                const d = await res.json();
                if (d.ok) toast({ title: "Success", description: "Export sent by email!", variant: "default" });
                else toast({ title: "Error", description: d.error, variant: "destructive" });
            } catch (e) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
            } finally {
                setLoading(false);
            }
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
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Confirmation</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p>{confirmMessage}</p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
                        <Button onClick={executeConfirmAction}>Confirm</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
                    onPointerDownOutside={e => e.preventDefault()}
                    onEscapeKeyDown={e => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{t(lang, "paramsTitle")}</DialogTitle>
                    </DialogHeader>

                    {/* Custom Tabs Header */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0">
                        <TabButton id="general" label="General" />
                        <TabButton id="email" label="Email" />
                        <TabButton id="export" label="Export" />
                        <TabButton id="security" label={t(lang, "security")} />
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 px-1">
                        {tab === 'general' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <div className="flex items-center h-6">
                                            <Label>{t(lang, "language")}</Label>
                                        </div>
                                        <Select value={setupLang} onValueChange={async (val) => {
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
                                        }}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="EN">English</SelectItem>
                                                <SelectItem value="FR">Français</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 h-6">
                                            <Label>{t(lang, "country")}</Label>
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
                                        <Label>{t(lang, "displayMode")}</Label>
                                        <Select value={displayMode} onValueChange={setDisplayMode}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="light">{t(lang, "displayModeLight")}</SelectItem>
                                                <SelectItem value="dark">{t(lang, "displayModeDark")}</SelectItem>
                                                <SelectItem value="system">{t(lang, "displayModeSystem")}</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>{t(lang, "theme")}</Label>
                                        <Select value={theme} onValueChange={(val) => { setTheme(val); applyTheme(val); }}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
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
                                <div className="space-y-2">
                                    <Label>{t(lang, "appTitle")}</Label>
                                    <Input value={appTitle} onChange={e => setAppTitle(e.target.value)} placeholder="Taskmaster" />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t(lang, "appSubtitle")}</Label>
                                    <Input value={appSubtitle} onChange={e => setAppSubtitle(e.target.value)} placeholder="Company" />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
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
                                    <div className="space-y-2">
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
                        )}

                        {tab === 'security' && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label>{t(lang, "adminPwd")}</Label>
                                    <div className="flex items-center gap-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setPwdTarget('admin'); setShowPwdDialog(true); }}
                                        >
                                            <Upload className="mr-2 h-4 w-4 rotate-90" />
                                            {t(lang, "changePwd")}
                                        </Button>
                                        {adminPwd && (
                                            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                                                {t(lang, "pwdChanged")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t(lang, "userPwd")}</Label>
                                    <div className="flex items-center gap-4">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => { setPwdTarget('user'); setShowPwdDialog(true); }}
                                        >
                                            <Upload className="mr-2 h-4 w-4 rotate-90" />
                                            {t(lang, "changePwd")}
                                        </Button>
                                        {userPwd && (
                                            <span className="text-sm text-green-600 dark:text-green-400 font-medium">
                                                {t(lang, "pwdChanged")}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {tab === 'email' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <Label>{t(lang, "emailNotifLegend")}</Label>
                                    <Switch checked={mailEnabled} onCheckedChange={setMailEnabled} />
                                </div>
                                {mailEnabled && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>{t(lang, "smtpHost")}</Label>
                                                <Input value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t(lang, "smtpPort")}</Label>
                                                <Input value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} id="secure" />
                                            <Label htmlFor="secure">{t(lang, "smtpSecure")}</Label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>{t(lang, "smtpUser")}</Label>
                                                <Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t(lang, "smtpPass")}</Label>
                                                <Input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label>{t(lang, "mailFrom")}</Label>
                                                <Input value={mailFrom} onChange={e => setMailFrom(e.target.value)} />
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t(lang, "mailTo")}</Label>
                                                <Input value={mailTo} onChange={e => setMailTo(e.target.value)} />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Switch checked={mailMissing} onCheckedChange={setMailMissing} id="missing" />
                                            <Label htmlFor="missing">{t(lang, "emailMissingEnable")}</Label>
                                        </div>


                                        <div className="flex gap-2 pt-2">
                                            <Button type="button" variant="outline" size="sm" onClick={handleTestMail}>
                                                Test SMTP
                                            </Button>
                                        </div>
                                    </>
                                )
                                }
                            </div >
                        )}

                        {
                            tab === 'export' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <Label>{t(lang, "autoExportLegend")}</Label>
                                        <Switch checked={exportEnabled} onCheckedChange={setExportEnabled} />
                                    </div>
                                    {exportEnabled && (
                                        <>
                                            <div className="flex gap-6 pb-2">
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={!!exportFormatCsv} onCheckedChange={(v) => setExportFormatCsv(!!v)} id="settings_export_csv" />
                                                    <Label htmlFor="settings_export_csv">CSV</Label>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Switch checked={!!exportFormatPdf} onCheckedChange={(v) => setExportFormatPdf(!!v)} id="settings_export_pdf" />
                                                    <Label htmlFor="settings_export_pdf">PDF</Label>
                                                </div>
                                            </div>

                                            {!exportFormatCsv && !exportFormatPdf && (
                                                <div className="text-sm text-yellow-600 dark:text-yellow-400 mb-2">
                                                    {t(lang, "exportFormatMissing")}
                                                </div>
                                            )}

                                            <div className="space-y-4">
                                                <div className="flex gap-4">
                                                    <div className="flex-1 space-y-2">
                                                        <Label>{t(lang, "autoExportFreq")}</Label>
                                                        <Select value={exportMode} onValueChange={setExportMode}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="day">{t(lang, "autoExportFreqDaily")}</SelectItem>
                                                                <SelectItem value="week">{t(lang, "autoExportFreqWeekly")}</SelectItem>
                                                                <SelectItem value="month">{t(lang, "autoExportFreqMonthly")}</SelectItem>
                                                                <SelectItem value="custom">Custom (Cron)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    {exportMode !== "custom" && (
                                                        <div className="w-32 space-y-2">
                                                            <Label>{t(lang, "exportTime")}</Label>
                                                            <Input type="time" value={exportTime} onChange={e => setExportTime(e.target.value)} />
                                                        </div>
                                                    )}
                                                </div>

                                                {exportMode === "week" && (
                                                    <div className="w-full space-y-2">
                                                        <Label>{t(lang, "exportDayOfWeek")}</Label>
                                                        <Select value={exportDayOfWeek} onValueChange={setExportDayOfWeek}>
                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="1">{t(lang, "dayMon")}</SelectItem>
                                                                <SelectItem value="2">{t(lang, "dayTue")}</SelectItem>
                                                                <SelectItem value="3">{t(lang, "dayWed")}</SelectItem>
                                                                <SelectItem value="4">{t(lang, "dayThu")}</SelectItem>
                                                                <SelectItem value="5">{t(lang, "dayFri")}</SelectItem>
                                                                <SelectItem value="6">{t(lang, "daySat")}</SelectItem>
                                                                <SelectItem value="0">{t(lang, "daySun")}</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                )}

                                                {exportMode === "month" && (
                                                    <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
                                                        <div className="flex items-center gap-4">
                                                            <Switch checked={exportMonthlyMode === "last"} onCheckedChange={(c) => setExportMonthlyMode(c ? "last" : "specific")} id="last_day" />
                                                            <Label htmlFor="last_day" className="whitespace-nowrap font-medium">{t(lang, "exLastDayOfMonth")}</Label>
                                                        </div>

                                                        {exportMonthlyMode !== "last" && (
                                                            <div className="space-y-3 pt-2 pl-2 border-l-2 border-slate-200 dark:border-slate-800 ml-2">
                                                                <div className="flex gap-4">
                                                                    <div className="w-1/2 space-y-2">
                                                                        <Label>Type</Label>
                                                                        <Select value={exportMonthlyMode} onValueChange={setExportMonthlyMode}>
                                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="specific">{t(lang, "monthlyTypeSpecific")}</SelectItem>
                                                                                <SelectItem value="relative">{t(lang, "monthlyTypeRelative")}</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                    <div className="w-1/2 flex items-end">
                                                                        {exportMonthlyMode === "specific" ? (
                                                                            <div className="space-y-2 w-full">
                                                                                <Label>{t(lang, "exDayOfMonth")} (1-31)</Label>
                                                                                <Input type="number" min="1" max="31" value={exportMonthlyDay} onChange={e => setExportMonthlyDay(e.target.value)} />
                                                                            </div>
                                                                        ) : (
                                                                            <div className="space-y-2 w-full">
                                                                                <Label>{t(lang, "rankFirst")}...</Label>
                                                                                <Select value={exportMonthlyRank} onValueChange={setExportMonthlyRank}>
                                                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                                                    <SelectContent>
                                                                                        <SelectItem value="1">{t(lang, "rankFirst")}</SelectItem>
                                                                                        <SelectItem value="2">{t(lang, "rankSecond")}</SelectItem>
                                                                                        <SelectItem value="3">{t(lang, "rankThird")}</SelectItem>
                                                                                        <SelectItem value="4">{t(lang, "rankFourth")}</SelectItem>
                                                                                        <SelectItem value="L">{t(lang, "rankLast")}</SelectItem>
                                                                                    </SelectContent>
                                                                                </Select>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {exportMonthlyMode === "relative" && (
                                                                    <div className="space-y-2">
                                                                        <Label>{t(lang, "exportDayOfWeek")}</Label>
                                                                        <Select value={exportMonthlyDow} onValueChange={setExportMonthlyDow}>
                                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="1">{t(lang, "dayMon")}</SelectItem>
                                                                                <SelectItem value="2">{t(lang, "dayTue")}</SelectItem>
                                                                                <SelectItem value="3">{t(lang, "dayWed")}</SelectItem>
                                                                                <SelectItem value="4">{t(lang, "dayThu")}</SelectItem>
                                                                                <SelectItem value="5">{t(lang, "dayFri")}</SelectItem>
                                                                                <SelectItem value="6">{t(lang, "daySat")}</SelectItem>
                                                                                <SelectItem value="0">{t(lang, "daySun")}</SelectItem>
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
                                                            <span>{new Date(cronPreview.next).toLocaleString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'long', timeStyle: 'short' })}</span>
                                                        </>
                                                    ) : (
                                                        <span className="text-red-500">
                                                            {cronPreview?.error || t(lang, "loading")}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-2">
                                                <Label>{t(lang, "exportDir")}</Label>
                                                <Input value={exportDir} onChange={e => setExportDir(e.target.value)} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label>{t(lang, "offsetFrom")}</Label>
                                                    <Input type="number" min="0" value={exportOffsetFrom} onChange={e => setExportOffsetFrom(parseInt(e.target.value) || 0)} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>{t(lang, "offsetTo")}</Label>
                                                    <Input type="number" min="0" value={exportOffsetTo} onChange={e => setExportOffsetTo(parseInt(e.target.value) || 0)} />
                                                </div>
                                            </div>

                                            <div className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-900 p-2 rounded">
                                                <p>
                                                    <strong>{t(lang, 'preview')}:</strong> {t(lang, 'previewIntro')}
                                                </p>
                                                <p className="font-mono mt-1">
                                                    {t(lang, 'from')} {new Date(Date.now() - (exportOffsetFrom * 86400000)).toLocaleDateString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })} <br />
                                                    {t(lang, 'to')} {new Date(Date.now() - (exportOffsetTo * 86400000)).toLocaleDateString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })}
                                                </p>
                                            </div>

                                            <div className="space-y-2">
                                                <Label>{t(lang, "cleanupRetentionLabel")}</Label>
                                                <Select value={String(exportRetention)} onValueChange={v => setExportRetention(parseInt(v) || 0)}>
                                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="0">{t(lang, "retentionNever")}</SelectItem>
                                                        <SelectItem value="30">{t(lang, "retention1Month")}</SelectItem>
                                                        <SelectItem value="180">{t(lang, "retention6Months")}</SelectItem>
                                                        <SelectItem value="365">{t(lang, "retention1Year")}</SelectItem>
                                                        <SelectItem value="3650">{t(lang, "retention10Years")}</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="flex items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                                                <Switch
                                                    checked={mailExportEnabled}
                                                    onCheckedChange={setMailExportEnabled}
                                                    id="mail_export"
                                                    disabled={!mailEnabled}
                                                />
                                                <Label htmlFor="mail_export" className={!mailEnabled ? "text-slate-400" : ""}>
                                                    {t(lang, "emailExportEnable")}
                                                </Label>
                                            </div>

                                            {mailExportEnabled && mailEnabled && (
                                                <div className="pl-6 pt-2 space-y-4">
                                                    <Label className="text-sm font-medium">Email Export Formats</Label>
                                                    <div className="flex gap-6">
                                                        <div className="flex items-center gap-2">
                                                            <Switch checked={mailExportCsv} onCheckedChange={setMailExportCsv} id="mailCsv" />
                                                            <Label htmlFor="mailCsv">CSV</Label>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <Switch checked={mailExportPdf} onCheckedChange={setMailExportPdf} id="mailPdf" />
                                                            <Label htmlFor="mailPdf">PDF</Label>
                                                        </div>
                                                    </div>
                                                    {!mailExportCsv && !mailExportPdf && (
                                                        <div className="text-sm text-yellow-600 dark:text-yellow-400">
                                                            {t(lang, "emailExportNoFormat")}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex gap-2 pt-2">
                                                <Button type="button" variant="outline" size="sm" onClick={handleTestExport}>
                                                    {t(lang, "testExportNow")}
                                                </Button>
                                                {mailEnabled && (
                                                    <Button type="button" variant="outline" size="sm" onClick={handleTestExportMail}>
                                                        {t(lang, "testExportEmail")}
                                                    </Button>
                                                )}
                                            </div>
                                        </>
                                    )}
                                </div>
                            )
                        }
                    </form >

                    <DialogFooter className="border-t border-slate-200 dark:border-slate-800 pt-4 shrink-0">
                        {error && <div className="text-sm text-rose-500 mr-auto">{error}</div>}
                        <Button onClick={handleSubmit} disabled={loading || !hasChanges || isInvalid}>
                            {loading ? "Saving..." : t(lang, "paramsSave")}
                        </Button>
                    </DialogFooter>
                    <PasswordChangeDialog
                        isOpen={showPwdDialog}
                        onClose={() => setShowPwdDialog(false)}
                        onSave={(pwd) => {
                            if (pwdTarget === 'admin') setAdminPwd(pwd);
                            else if (pwdTarget === 'user') setUserPwd(pwd);
                            setShowPwdDialog(false);
                        }}
                        lang={lang}
                        title={pwdTarget === 'admin' ? t(lang, "adminPwd") : t(lang, "userPwd")}
                    />
                </DialogContent>
            </Dialog>
        </>
    );
}
