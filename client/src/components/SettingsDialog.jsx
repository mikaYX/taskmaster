import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { t, I18N, COUNTRY_TIMEZONE, COUNTRY_NAMES } from "@/lib/constants";
import { apiFetch } from "@/lib/api";
import { Upload, Info, Key, Tags, Server, Trash2, Database } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/components/ui/use-toast";
import { PasswordChangeDialog } from "./PasswordChangeDialog";
import { CreateGroupDialog } from "./CreateGroupDialog";
import { ReassignUserDialog } from "./ReassignUserDialog";
import { UserDetailsDialog } from "./UserDetailsDialog";
import { AddUserDialog } from "./AddUserDialog";
import { GroupManagementDialog } from "./GroupManagementDialog";
import { AuthManagementDialog } from "./AuthManagementDialog";
import { GeneralSettingsTab } from "./settings/GeneralSettingsTab";
import { SecuritySettingsTab } from "./settings/SecuritySettingsTab";
import { AuthSettingsTab } from "./settings/AuthSettingsTab";
import { EmailSettingsTab } from "./settings/EmailSettingsTab";
import { ExportSettingsTab } from "./settings/ExportSettingsTab";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronsUpDown, User as UserIcon } from "lucide-react";
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

    // Team Users
    const [users, setUsers] = useState([]);
    const [showAddUserDialog, setShowAddUserDialog] = useState(false);
    const [editPwdIndex, setEditPwdIndex] = useState(null);
    const [editDetailsIndex, setEditDetailsIndex] = useState(null); // For fullname/email modal
    const [userToDelete, setUserToDelete] = useState(null); // For delete confirmation
    const [availableGroups, setAvailableGroups] = useState([]);
    const [showCreateGroup, setShowCreateGroup] = useState(false);
    const [showGroupManagement, setShowGroupManagement] = useState(false);
    const [showAuthManagement, setShowAuthManagement] = useState(false);
    const [reassignState, setReassignState] = useState({ isOpen: false, user: null, index: null, tasks: [] });

    useEffect(() => {
        if (isOpen) {
            fetch('/api/roles', { headers: { 'Authorization': 'Bearer ' + localStorage.getItem('checklist_auth_token') } })
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) setAvailableGroups(data);
                })
                .catch(console.error);
        }
    }, [isOpen]);

    // Handle group deletion
    const handleDeleteGroup = async (groupName) => {
        if (!confirm(`Delete group "${groupName}"?`)) return;

        try {
            // Find the group to get its ID
            const group = availableGroups.find(g => g.name === groupName);
            if (!group || !group.id) {
                toast({ title: "Error", description: "Group not found.", variant: "destructive" });
                return;
            }

            const token = localStorage.getItem('checklist_auth_token');
            const res = await fetch(`/api/roles/${group.id}`, {
                method: 'DELETE',
                headers: { 'Authorization': 'Bearer ' + token }
            });

            if (!res.ok) throw new Error('Failed to delete group');

            // Remove from availableGroups
            setAvailableGroups(availableGroups.filter(g => g.name !== groupName));

            // Remove group from all users
            setUsers(users.map(user => ({
                ...user,
                groups: user.groups ? user.groups.filter(g => g !== groupName) : []
            })));

            toast({
                title: "Group deleted",
                description: `Group "${groupName}" has been deleted successfully.`
            });
        } catch (err) {
            console.error('Error deleting group:', err);
            toast({
                title: "Error",
                description: "Failed to delete group.",
                variant: "destructive"
            });
        }
    };

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

    // New Email Features
    const [mailMissingRecipients, setMailMissingRecipients] = useState(['admin']);
    const [mailReminderEnabled, setMailReminderEnabled] = useState(false);
    const [mailReminderRecipients, setMailReminderRecipients] = useState(['assigned']);
    const [mailReminderOffsetHours, setMailReminderOffsetHours] = useState(1);
    const [mailReminderOffsetMinutes, setMailReminderOffsetMinutes] = useState(0);
    const [mailCustomEmails, setMailCustomEmails] = useState("");

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

    // Auth Config State
    const [authAzureEnabled, setAuthAzureEnabled] = useState(false);
    const [authAzureTenant, setAuthAzureTenant] = useState("");
    const [authAzureClientId, setAuthAzureClientId] = useState("");
    const [authAzureClientSecret, setAuthAzureClientSecret] = useState("");

    const [authLdapEnabled, setAuthLdapEnabled] = useState(false);
    const [authLdapUrl, setAuthLdapUrl] = useState("");
    const [authLdapBindDn, setAuthLdapBindDn] = useState("");
    const [authLdapBindPassword, setAuthLdapBindPassword] = useState("");
    const [authLdapSearchBase, setAuthLdapSearchBase] = useState("");
    const [authLdapFilter, setAuthLdapFilter] = useState("");

    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [originalSettings, setOriginalSettings] = useState(null);

    const logoInputRef = useRef(null);
    const favInputRef = useRef(null);

    // Confirmation State
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmAction, setConfirmAction] = useState(null); // 'mail' | 'export' | 'export-mail'
    const [confirmMessage, setConfirmMessage] = useState("");

    // Backup Options State
    const [showBackupOptions, setShowBackupOptions] = useState(false);
    const [backupFormat, setBackupFormat] = useState('json'); // 'json' | 'zip' -- actually we handle this with new handler
    const [isExportingBackup, setIsExportingBackup] = useState(false);
    const [backupPassword, setBackupPassword] = useState("");

    // Restore State
    const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
    const [restoreFile, setRestoreFile] = useState(null);
    const [restorePassword, setRestorePassword] = useState("");
    const [showRestorePasswordInput, setShowRestorePasswordInput] = useState(false);

    // Auto Backup Settings
    const [autoBackupEnabled, setAutoBackupEnabled] = useState(false);
    const [autoBackupCron, setAutoBackupCron] = useState("0 2 * * *");
    const [autoBackupType, setAutoBackupType] = useState('json');
    const [autoBackupPassword, setAutoBackupPassword] = useState("");
    const [autoBackupRetentionCount, setAutoBackupRetentionCount] = useState(3);

    // Auto Backup Freq States
    const [autoBackupMode, setAutoBackupMode] = useState("day"); // day, week, month, custom
    const [autoBackupTime, setAutoBackupTime] = useState("02:00");
    const [autoBackupDayOfWeek, setAutoBackupDayOfWeek] = useState("1"); // Monday
    const [autoBackupCustomCron, setAutoBackupCustomCron] = useState("0 2 * * *");
    const [autoBackupPreview, setAutoBackupPreview] = useState(null);
    const [debouncedAutoCron, setDebouncedAutoCron] = useState("");
    const [mailExportRecipients, setMailExportRecipients] = useState(['admin']);

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

            // New Email Features
            setMailMissingRecipients(data.mail_missing_recipients || ['admin']);
            setMailReminderEnabled(!!data.mail_reminder_enabled);
            setMailReminderRecipients(data.mail_reminder_recipients || ['assigned']);
            setMailReminderOffsetHours(data.mail_reminder_offset_hours !== undefined ? data.mail_reminder_offset_hours : 1);
            setMailReminderOffsetMinutes(data.mail_reminder_offset_minutes !== undefined ? data.mail_reminder_offset_minutes : 0);
            setMailCustomEmails(data.mail_custom_emails || "");
            setMailExportRecipients(data.mail_export_recipients || ['admin']);

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
            setExportMonthlyRank(mRank);
            setExportMonthlyDow(mDow);

            // Auth Config Load
            setAuthAzureEnabled(!!data.auth_azure_enabled);
            setAuthAzureTenant(data.auth_azure_tenant_id || "");
            setAuthAzureClientId(data.auth_azure_client_id || "");
            setAuthAzureClientSecret(data.auth_azure_client_secret ? "••••••••" : "");

            setAuthLdapEnabled(!!data.auth_ldap_enabled);
            setAuthLdapUrl(data.auth_ldap_url || "");
            setAuthLdapBindDn(data.auth_ldap_bind_dn || "");
            setAuthLdapBindPassword(data.auth_ldap_bind_password ? "••••••••" : "");
            setAuthLdapSearchBase(data.auth_ldap_search_base || "");
            setAuthLdapFilter(data.auth_ldap_filter || "");

            // Store parsed values in originalSettings for proper diffing
            setOriginalSettings({
                ...data,
                _exportTime: `${hr}:${min}`,
                _exportDayOfWeek: weeklyDow,
                _exportMonthlyMode: mMode,
                _exportMonthlyDay: mDay,
                _exportMonthlyRank: mRank,
                _exportMonthlyDow: mDow,
                _exportCustomCron: data.auto_export_cron,

                _autoBackupEnabled: !!data.auto_backup_enabled,
                _autoBackupCron: data.auto_backup_cron,
                _autoBackupType: data.auto_backup_type,
                _autoBackupPassword: data.auto_backup_password
            });

            // Auto Backup
            setAutoBackupEnabled(!!data.auto_backup_enabled);
            const abCron = data.auto_backup_cron || "0 2 * * *";
            setAutoBackupCron(abCron);
            setAutoBackupType(data.auto_backup_type || 'json');
            setAutoBackupPassword(data.auto_backup_password || "");
            setAutoBackupRetentionCount(data.auto_backup_retention_count || 3);

            // Parse Auto Cron
            const abParts = abCron.split(" ");
            const abMin = (abParts[0] || "0").padStart(2, "0");
            const abHr = (abParts[1] || "2").padStart(2, "0");
            const abDom = abParts[2] || "*";
            const abDow = abParts[4] || "*";

            setAutoBackupTime(`${abHr}:${abMin}`);
            setAutoBackupCustomCron(abCron);

            let abMode = "custom";
            if (abDom === "*" && abDow === "*") {
                abMode = "day";
            } else if (abDom === "*" && abDow !== "*") {
                abMode = "week";
                setAutoBackupDayOfWeek(abDow);
            }
            setAutoBackupMode(abMode);

            // Fetch users
            const uRes = await apiFetch("/api/users");
            let initialUsers = [];
            if (uRes.ok) {
                const uData = await uRes.json();
                // users come with created_at etc.
                // We map relevant fields, and also handle password placeholder (empty string means no change)
                initialUsers = uData.map(u => ({
                    ...u,
                    password: '',
                    groups: u.groups && u.groups.length ? u.groups : [u.role],
                    fullname: u.fullname || '',
                    email: u.email || ''
                }));
                setUsers(initialUsers);
            }

            // Store parsed values in originalSettings for proper diffing (deep clone)
            setOriginalSettings(prev => ({
                ...prev,
                _users: JSON.parse(JSON.stringify(initialUsers))
            }));


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
                return `${sMin} ${sHr} 28 - 31 * * `;
            } else if (exportMonthlyMode === "specific") {
                return `${sMin} ${sHr} ${parseInt(exportMonthlyDay) || 1} * * `;
            } else {
                // relative
                const r = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank} `;
                // If rank is L, syntax is 5L. If rank is N, 5#N.
                // NOTE: node-cron supports 5L (last Friday).
                const suffix = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank} `;
                return `${sMin} ${sHr} * * ${exportMonthlyDow}${suffix} `;
            }
        } else {
            // day
            return `${sMin} ${sHr} * * * `;
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


    // Auto Backup Effective Cron Calculation
    useEffect(() => {
        let newCron = autoBackupCron;
        const [hr, min] = (autoBackupTime || "02:00").split(":");
        const sHr = String(parseInt(hr) || 2);
        const sMin = String(parseInt(min) || 0);

        if (autoBackupMode === "day") {
            newCron = `${sMin} ${sHr} * * *`;
        } else if (autoBackupMode === "week") {
            newCron = `${sMin} ${sHr} * * ${autoBackupDayOfWeek}`;
        } else if (autoBackupMode === "custom") {
            newCron = autoBackupCustomCron;
        }

        if (newCron !== autoBackupCron) {
            setAutoBackupCron(newCron);
        }
    }, [autoBackupMode, autoBackupTime, autoBackupDayOfWeek, autoBackupCustomCron]);

    // Preview for Auto Backup (Custom only or all? User asked for preview in general or just custom?)
    // "custom (choix en cron comme actuellement avec une preview)" - could imply only custom gets preview or all.
    // Let's debounce checking autoBackupCron
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedAutoCron(autoBackupCron);
        }, 500);
        return () => clearTimeout(timer);
    }, [autoBackupCron]);

    useEffect(() => {
        if (!debouncedAutoCron || autoBackupMode !== 'custom') {
            setAutoBackupPreview(null);
            if (autoBackupMode !== 'custom') return; // Only show preview for custom or debug? User asked "comme actuellement avec une preview" for custom.
        }
        // Actually, showing preview for ALL modes is nicer.

        async function fetchAutoPreview() {
            try {
                const token = localStorage.getItem("checklist_auth_token");
                const res = await fetch("/api/cron-preview", {
                    method: "POST",
                    headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                    body: JSON.stringify({ cron: debouncedAutoCron, country })
                });
                const d = await res.json();
                setAutoBackupPreview(d);
            } catch (e) {
                console.error("Preview fetch error", e);
            }
        }
        fetchAutoPreview();
    }, [debouncedAutoCron, country, autoBackupMode]);


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
            !eq(mailExportRecipients, originalSettings.mail_export_recipients) ||
            !eq(mailMissingRecipients, originalSettings.mail_missing_recipients) ||
            !eqBool(mailReminderEnabled, originalSettings.mail_reminder_enabled) ||
            !eq(mailReminderRecipients, originalSettings.mail_reminder_recipients) ||
            !eq(mailReminderOffsetHours, originalSettings.mail_reminder_offset_hours) ||
            !eq(mailReminderOffsetMinutes, originalSettings.mail_reminder_offset_minutes) ||
            !eq(mailCustomEmails, originalSettings.mail_custom_emails) ||
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
            !eq(exportCustomCron, originalSettings._exportCustomCron) ||

            // Auth Changes
            !eqBool(authAzureEnabled, originalSettings.auth_azure_enabled) ||
            !eq(authAzureTenant, originalSettings.auth_azure_tenant_id) ||
            !eq(authAzureClientId, originalSettings.auth_azure_client_id) ||
            !eq(authAzureClientSecret, originalSettings.auth_azure_client_secret) ||
            !eqBool(authLdapEnabled, originalSettings.auth_ldap_enabled) ||
            !eq(authLdapUrl, originalSettings.auth_ldap_url) ||
            !eq(authLdapBindDn, originalSettings.auth_ldap_bind_dn) ||
            !eq(authLdapBindPassword, originalSettings.auth_ldap_bind_password) ||
            !eq(authLdapSearchBase, originalSettings.auth_ldap_search_base) ||
            !eq(authLdapFilter, originalSettings.auth_ldap_filter) ||

            logoFile !== null ||
            favFile !== null ||
            // Users change check: just length or simple stringify check for now.
            // Ideally should be deep equality but JSON.stringify(users) vs JSON.stringify(originalSettings._users) is okay for small arrays.
            // We need to store original users to compare.
            // Users change check
            JSON.stringify(users.map(u => ({
                username: u.username,
                groups: u.groups || [u.role],
                password: u.password,
                fullname: u.fullname,
                email: u.email,
                auth_provider: u.auth_provider,
                must_change_password: u.must_change_password
            }))) !==
            JSON.stringify(originalSettings._users?.map(u => ({
                username: u.username,
                groups: u.groups || [u.role],
                password: u.password,
                fullname: u.fullname,
                email: u.email,
                auth_provider: u.auth_provider,
                must_change_password: u.must_change_password
            }))) ||
            !eqBool(autoBackupEnabled, originalSettings._autoBackupEnabled) ||
            !eq(autoBackupCron, originalSettings._autoBackupCron) ||
            !eq(autoBackupType, originalSettings._autoBackupType) ||
            !eq(autoBackupPassword, originalSettings._autoBackupPassword) ||
            !eq(autoBackupRetentionCount, originalSettings.auto_backup_retention_count)
        );
    }, [
        originalSettings, appTitle, appSubtitle, setupLang, country, theme, displayMode,
        mailEnabled, smtpHost, smtpPort, smtpUser, smtpPass, smtpSecure, mailFrom, mailTo, mailMissing,
        mailExportEnabled, mailExportCsv, mailExportPdf,
        exportEnabled, exportMode, exportDir, exportFormatCsv, exportFormatPdf, exportOffsetFrom, exportOffsetTo, exportRetention,
        exportTime, exportDayOfWeek, exportMonthlyMode, exportMonthlyDay, exportMonthlyRank, exportMonthlyDow, exportCustomCron,
        logoFile, favFile, users,
        authAzureEnabled, authAzureTenant, authAzureClientId, authAzureClientSecret,
        authLdapEnabled, authLdapUrl, authLdapBindDn, authLdapBindPassword, authLdapSearchBase, authLdapFilter,
        autoBackupEnabled, autoBackupCron, autoBackupType, autoBackupPassword, autoBackupRetentionCount,
        autoBackupMode, autoBackupTime, autoBackupDayOfWeek, autoBackupCustomCron,
        mailExportRecipients, mailCustomEmails, mailMissingRecipients, mailReminderEnabled, mailReminderRecipients
    ]);

    const isInvalid = useMemo(() => {
        if (mailExportEnabled && !mailExportCsv && !mailExportPdf) return true;
        if (exportEnabled && !exportFormatCsv && !exportFormatPdf) return true;

        // Team Users validation
        // Must have at least one user
        if (users.length === 0) return true;

        // Check if any user has empty username
        if (users.some(u => !u.username || u.username.trim() === '')) return true;

        // New users (no id) must have password IF local
        if (users.some(u => !u.id && (!u.auth_provider || u.auth_provider === 'local') && (!u.password || u.password.trim() === ''))) return true;

        // At least one admin
        if (!users.some(u => (u.groups && u.groups.includes('admin')) || u.role === 'admin')) return true;

        return false;
    }, [mailExportEnabled, mailExportCsv, mailExportPdf, exportEnabled, exportFormatCsv, exportFormatPdf, users]);

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
            fd.append("users", JSON.stringify(users));

            if (adminPwd) fd.append("admin_password", adminPwd);
            if (adminPwd) fd.append("admin_password", adminPwd);
            if (userPwd) fd.append("user_password", userPwd);

            // Auth Config Submit
            fd.append("auth_azure_enabled", authAzureEnabled ? "1" : "0");
            fd.append("auth_azure_tenant_id", authAzureTenant);
            fd.append("auth_azure_client_id", authAzureClientId);
            if (authAzureClientSecret && authAzureClientSecret !== "••••••••") fd.append("auth_azure_client_secret", authAzureClientSecret);

            fd.append("auth_ldap_enabled", authLdapEnabled ? "1" : "0");
            fd.append("auth_ldap_url", authLdapUrl);
            fd.append("auth_ldap_bind_dn", authLdapBindDn);
            if (authLdapBindPassword && authLdapBindPassword !== "••••••••") fd.append("auth_ldap_bind_password", authLdapBindPassword);
            fd.append("auth_ldap_search_base", authLdapSearchBase);
            fd.append("auth_ldap_filter", authLdapFilter);

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
            fd.append("mail_export_recipients", JSON.stringify(mailExportRecipients));

            // New Email Features
            fd.append("mail_missing_recipients", JSON.stringify(mailMissingRecipients || ['admin']));
            fd.append("mail_reminder_enabled", mailReminderEnabled ? "1" : "0");
            fd.append("mail_reminder_recipients", JSON.stringify(mailReminderRecipients || ['assigned']));
            fd.append("mail_reminder_offset_hours", mailReminderOffsetHours);
            fd.append("mail_reminder_offset_minutes", mailReminderOffsetMinutes);
            fd.append("mail_custom_emails", mailCustomEmails);

            // Export
            fd.append("auto_export_enabled", exportEnabled ? "1" : "0");
            fd.append("export_dir", exportDir);
            fd.append("export_format_csv", exportFormatCsv ? "1" : "0");
            fd.append("export_format_pdf", exportFormatPdf ? "1" : "0");
            fd.append("auto_export_from_offset_days", exportOffsetFrom);
            fd.append("auto_export_to_offset_days", exportOffsetTo);
            fd.append("export_retention_days", exportRetention);

            // Auto Backup
            fd.append("auto_backup_enabled", autoBackupEnabled ? "1" : "0");
            fd.append("auto_backup_cron", autoBackupCron);
            fd.append("auto_backup_type", autoBackupType);
            fd.append("auto_backup_password", autoBackupPassword);
            fd.append("auto_backup_retention_count", autoBackupRetentionCount);

            const [hr, min] = (exportTime || "19:30").split(":");
            const parsedHr = parseInt(hr);
            const parsedMin = parseInt(min);
            const sHr = String(isNaN(parsedHr) ? 19 : parsedHr);
            const sMin = String(isNaN(parsedMin) ? 30 : parsedMin);

            if (exportMode === "week") {
                fd.append("auto_export_mode", "week");
                let dow = exportDayOfWeek === "*" ? "5" : exportDayOfWeek;
                fd.append("auto_export_cron", `${sMin} ${sHr} * * ${dow} `);
            } else if (exportMode === "month") {
                fd.append("auto_export_mode", "month_to_date");
                let cronStr = "";
                if (exportMonthlyMode === "last") {
                    cronStr = `${sMin} ${sHr} 28 - 31 * * `;
                } else if (exportMonthlyMode === "specific") {
                    const dom = parseInt(exportMonthlyDay) || 1;
                    cronStr = `${sMin} ${sHr} ${dom} * * `;
                } else {
                    const suffix = exportMonthlyRank === "L" ? "L" : `#${exportMonthlyRank} `;
                    cronStr = `${sMin} ${sHr} * * ${exportMonthlyDow}${suffix} `;
                }
                fd.append("auto_export_cron", cronStr);
            } else if (exportMode === "custom") {
                fd.append("auto_export_mode", "custom");
                fd.append("auto_export_cron", exportCustomCron);
            } else {
                fd.append("auto_export_mode", "day");
                fd.append("auto_export_cron", `${sMin} ${sHr} * * * `);
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
                    body: JSON.stringify({
                        mail_export_recipients: mailExportRecipients,
                        mail_custom_emails: mailCustomEmails
                    })
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

    const handleDownloadBackup = () => {
        setShowBackupOptions(true);
    };

    const confirmDownloadBackup = async (type) => {
        setShowBackupOptions(false);
        setIsExportingBackup(true);
        toast({ title: t(lang, "backupDownloading"), description: "..." });

        try {
            const token = localStorage.getItem("checklist_auth_token");
            let url = `/api/backup/export?type=${type}`;
            if (backupPassword) {
                // Encode password simply, but should be handled carefully. Query param is basic but ok for this.
                url += `&password=${encodeURIComponent(backupPassword)}`;
            }

            const res = await fetch(url, {
                headers: { "Authorization": "Bearer " + token }
            });

            if (res.ok) {
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                // Filename from header or default
                const disposition = res.headers.get('Content-Disposition');
                let filename = `taskmaster - backup - ${new Date().toISOString().slice(0, 10)}.${type === 'zip' ? 'zip' : 'json'}`;
                if (disposition && disposition.indexOf('attachment') !== -1) {
                    const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1].replace(/['"]/g, '');
                    }
                }
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
                toast({ title: t(lang, "success"), description: "Backup downloaded successfully" });
            } else {
                toast({ title: t(lang, "error"), description: "Failed to download backup", variant: "destructive" });
            }
        } catch (e) {
            console.error(e);
            toast({ title: t(lang, "error"), description: "Network error", variant: "destructive" });
        } finally {
            setIsExportingBackup(false);
            setBackupPassword(""); // Reset password after use
        }
    };

    const handleRestoreClick = () => {
        // Trigger file input
        document.getElementById('restore-input').click();
    };

    const onRestoreFileSelected = (e) => {
        if (e.target.files?.[0]) {
            setRestoreFile(e.target.files[0]);
            setShowRestoreConfirm(true);
            setRestorePassword("");
            setShowRestorePasswordInput(false);
            e.target.value = null; // reset
        }
    };

    const executeRestore = async () => {
        if (!restoreFile) return;

        setLoading(true);
        toast({ title: t(lang, "backupRestoring"), description: "..." });

        try {
            const formData = new FormData();
            formData.append('backup', restoreFile);
            if (restorePassword) formData.append('password', restorePassword);

            const token = localStorage.getItem("checklist_auth_token");
            const res = await fetch("/api/backup/import", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                // Content-Type header must NOT be set when using FormData
                body: formData
            });

            if (res.status === 401) {
                // Password required
                const d = await res.json();
                if (d.requiresPassword) {
                    setShowRestorePasswordInput(true);
                    toast({ title: t(lang, "error"), description: "Password required for this backup", variant: "destructive" });
                    setLoading(false);
                    return;
                }
            }

            if (res.status === 403) {
                toast({ title: t(lang, "error"), description: "Invalid password", variant: "destructive" });
                setLoading(false);
                return;
            }

            if (res.ok) {
                toast({ title: t(lang, "success"), description: "Backup restored. Reloading..." });
                setTimeout(() => window.location.reload(), 1500);
            } else {
                const d = await res.json();
                toast({ title: t(lang, "error"), description: d.error || "Failed to restore", variant: "destructive" });
                setLoading(false);
            }
        } catch (err) {
            console.error(err);
            toast({ title: t(lang, "error"), description: err.message, variant: "destructive" });
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
                } `}
        >
            {label}
        </button>
    );

    const handleDeleteUser = async (i) => {
        const u = users[i];
        if (!u.id) {
            setUsers(users.filter((_, idx) => idx !== i));
            return;
        }

        // API Check
        try {
            const token = localStorage.getItem("checklist_auth_token");
            const res = await fetch('/api/check-user-dependencies', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ userId: u.id })
            });
            const data = await res.json();
            if (data.count > 0) {
                setReassignState({ isOpen: true, user: u, index: i, tasks: data.tasks });
            } else {
                setUsers(users.filter((_, idx) => idx !== i));
            }
        } catch (e) {
            console.error(e);
            toast({ title: t(lang, "error"), description: "Failed to check user tasks", variant: "destructive" });
        }
    };

    const handleConfirmReassign = async ({ newUserId, newGroupId }) => {
        const u = reassignState.user;
        const index = reassignState.index;

        try {
            const token = localStorage.getItem("checklist_auth_token");
            const res = await fetch('/api/reassign-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ oldUserId: u.id, newUserId, newGroupId })
            });
            const d = await res.json();
            if (d.ok) {
                toast({ title: "Success", description: "Tasks reassigned" });
                setUsers(users.filter((_, idx) => idx !== index));
                setReassignState({ isOpen: false, user: null, index: null, tasks: [] });
            } else {
                toast({ title: t(lang, "error"), description: d.error, variant: "destructive" });
            }
        } catch (e) {
            toast({ title: t(lang, "error"), description: e.message, variant: "destructive" });
        }
    };

    return (
        <>
            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Confirmation</DialogTitle>
                        <DialogDescription className="hidden">Confirm Action</DialogDescription>
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

            {editPwdIndex !== null && (
                <PasswordChangeDialog
                    isOpen={true}
                    onClose={() => setEditPwdIndex(null)}
                    lang={setupLang} // Use setupLang for the dialog content or 'lang' from prop? usually 'lang' prop is for UI, but setupLang is what user picked. 'lang' prop is passed to dialog.
                    title={users[editPwdIndex]?.username ? `${t(lang, "passwordFor")} ${users[editPwdIndex].username} ` : t(lang, "setPassword")}
                    onSave={(pwd) => {
                        const n = users.map((user, idx) => {
                            if (idx === editPwdIndex) {
                                // If the user is not an admin, set must_change_password to true
                                const isAdmin = user.groups && user.groups.includes('admin');
                                const isLocalAccount = !user.auth_provider || user.auth_provider === 'local';
                                return {
                                    ...user,
                                    password: pwd,
                                    // Force password change on next login for non-admin local accounts
                                    must_change_password: isLocalAccount && !isAdmin
                                };
                            }
                            return user;
                        });
                        setUsers(n);
                    }}
                />
            )}

            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col"
                    onPointerDownOutside={e => e.preventDefault()}
                    onEscapeKeyDown={e => e.preventDefault()}>
                    <DialogHeader>
                        <DialogTitle>{t(lang, "paramsTitle")}</DialogTitle>
                        <DialogDescription className="hidden">Setup Application Settings</DialogDescription>
                    </DialogHeader>

                    {/* Custom Tabs Header */}
                    <div className="flex border-b border-slate-200 dark:border-slate-800 shrink-0 gap-4">
                        <TabButton id="general" label={t(lang, "settingsGeneral")} />
                        <TabButton id="email" label={t(lang, "settingsEmail")} />
                        <TabButton id="export" label={t(lang, "settingsExport")} />
                        <TabButton id="security" label={t(lang, "security")} />
                    </div>

                    <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 px-1">
                        {tab === 'general' && (
                            <GeneralSettingsTab
                                lang={lang}
                                setupLang={setupLang}
                                setSetupLang={setSetupLang}
                                country={country}
                                setCountry={setCountry}
                                displayMode={displayMode}
                                setDisplayMode={setDisplayMode}
                                theme={theme}
                                setTheme={setTheme}
                                appTitle={appTitle}
                                setAppTitle={setAppTitle}
                                appSubtitle={appSubtitle}
                                setAppSubtitle={setAppSubtitle}
                                logoFile={logoFile}
                                setLogoFile={setLogoFile}
                                favFile={favFile}
                                setFavFile={setFavFile}
                                onConfigChange={onConfigChange}
                            />
                        )}

                        {tab === 'security' && (
                            <SecuritySettingsTab
                                lang={lang}
                                users={users}
                                setUsers={setUsers}
                                availableGroups={availableGroups}
                                setShowGroupManagement={setShowGroupManagement}
                                setShowAuthManagement={setShowAuthManagement}
                                setShowAddUserDialog={setShowAddUserDialog}
                                setEditPwdIndex={setEditPwdIndex}
                                setEditDetailsIndex={setEditDetailsIndex}
                                setUserToDelete={setUserToDelete}
                            />
                        )}



                        {tab === 'email' && (
                            <EmailSettingsTab
                                lang={lang}
                                mailEnabled={mailEnabled}
                                setMailEnabled={setMailEnabled}
                                smtpHost={smtpHost}
                                setSmtpHost={setSmtpHost}
                                smtpPort={smtpPort}
                                setSmtpPort={setSmtpPort}
                                smtpSecure={smtpSecure}
                                setSmtpSecure={setSmtpSecure}
                                smtpUser={smtpUser}
                                setSmtpUser={setSmtpUser}
                                smtpPass={smtpPass}
                                setSmtpPass={setSmtpPass}
                                mailFrom={mailFrom}
                                setMailFrom={setMailFrom}
                                mailTo={mailTo}
                                setMailTo={setMailTo}
                                mailMissing={mailMissing}
                                setMailMissing={setMailMissing}
                                mailMissingRecipients={mailMissingRecipients}
                                setMailMissingRecipients={setMailMissingRecipients}
                                mailReminderEnabled={mailReminderEnabled}
                                setMailReminderEnabled={setMailReminderEnabled}
                                mailReminderRecipients={mailReminderRecipients}
                                setMailReminderRecipients={setMailReminderRecipients}
                                mailReminderOffsetHours={mailReminderOffsetHours}
                                setMailReminderOffsetHours={setMailReminderOffsetHours}
                                mailReminderOffsetMinutes={mailReminderOffsetMinutes}
                                setMailReminderOffsetMinutes={setMailReminderOffsetMinutes}
                                mailCustomEmails={mailCustomEmails}
                                setMailCustomEmails={setMailCustomEmails}
                                handleTestMail={handleTestMail}
                            />
                        )}

                        {tab === 'export' && (
                            <ExportSettingsTab
                                lang={lang}
                                exportEnabled={exportEnabled}
                                setExportEnabled={setExportEnabled}
                                exportFormatCsv={exportFormatCsv}
                                setExportFormatCsv={setExportFormatCsv}
                                exportFormatPdf={exportFormatPdf}
                                setExportFormatPdf={setExportFormatPdf}
                                exportMode={exportMode}
                                setExportMode={setExportMode}
                                exportTime={exportTime}
                                setExportTime={setExportTime}
                                exportDayOfWeek={exportDayOfWeek}
                                setExportDayOfWeek={setExportDayOfWeek}
                                exportMonthlyMode={exportMonthlyMode}
                                setExportMonthlyMode={setExportMonthlyMode}
                                exportMonthlyDay={exportMonthlyDay}
                                setExportMonthlyDay={setExportMonthlyDay}
                                exportMonthlyRank={exportMonthlyRank}
                                setExportMonthlyRank={setExportMonthlyRank}
                                exportMonthlyDow={exportMonthlyDow}
                                setExportMonthlyDow={setExportMonthlyDow}
                                exportCustomCron={exportCustomCron}
                                setExportCustomCron={setExportCustomCron}
                                cronPreview={cronPreview}
                                effectiveCron={effectiveCron}
                                exportDir={exportDir}
                                setExportDir={setExportDir}
                                exportOffsetFrom={exportOffsetFrom}
                                setExportOffsetFrom={setExportOffsetFrom}
                                exportOffsetTo={exportOffsetTo}
                                setExportOffsetTo={setExportOffsetTo}
                                exportRetention={exportRetention}
                                setExportRetention={setExportRetention}
                                mailExportEnabled={mailExportEnabled}
                                setMailExportEnabled={setMailExportEnabled}
                                mailExportCsv={mailExportCsv}
                                setMailExportCsv={setMailExportCsv}
                                mailExportPdf={mailExportPdf}
                                setMailExportPdf={setMailExportPdf}
                                mailEnabled={mailEnabled}
                                handleTestExport={handleTestExport}
                                handleTestExportMail={handleTestExportMail}
                                onDownloadBackup={handleDownloadBackup}
                                onRestoreBackup={handleRestoreClick}

                                autoBackupEnabled={autoBackupEnabled}
                                setAutoBackupEnabled={setAutoBackupEnabled}
                                autoBackupCron={autoBackupCron}
                                setAutoBackupCron={setAutoBackupCron}
                                autoBackupType={autoBackupType}
                                setAutoBackupType={setAutoBackupType}
                                autoBackupPassword={autoBackupPassword}
                                setAutoBackupPassword={setAutoBackupPassword}

                                autoBackupMode={autoBackupMode}
                                setAutoBackupMode={setAutoBackupMode}
                                autoBackupTime={autoBackupTime}
                                setAutoBackupTime={setAutoBackupTime}
                                autoBackupDayOfWeek={autoBackupDayOfWeek}
                                setAutoBackupDayOfWeek={setAutoBackupDayOfWeek}
                                autoBackupCustomCron={autoBackupCustomCron}
                                setAutoBackupCustomCron={setAutoBackupCustomCron}
                                autoBackupPreview={autoBackupPreview}
                                effectiveAutoCron={autoBackupCron}
                                autoBackupRetentionCount={autoBackupRetentionCount}
                                setAutoBackupRetentionCount={setAutoBackupRetentionCount}
                                mailExportRecipients={mailExportRecipients}
                                setMailExportRecipients={setMailExportRecipients}
                                mailCustomEmails={mailCustomEmails}
                                setMailCustomEmails={setMailCustomEmails}
                            />
                        )}
                        <input
                            id="restore-input"
                            type="file"
                            accept=".json,.zip"
                            className="hidden"
                            onChange={onRestoreFileSelected}
                        />
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
                    <CreateGroupDialog
                        isOpen={showCreateGroup}
                        onClose={() => setShowCreateGroup(false)}
                        lang={lang}
                        onGroupCreated={(newGroup) => {
                            setAvailableGroups([...availableGroups, newGroup]);
                        }}
                    />
                    <GroupManagementDialog
                        isOpen={showGroupManagement}
                        onClose={() => setShowGroupManagement(false)}
                        lang={lang}
                        groups={availableGroups}
                        users={users}
                        onDeleteGroup={handleDeleteGroup}
                        onCreateGroup={() => setShowCreateGroup(true)}
                    />
                    <AuthManagementDialog
                        isOpen={showAuthManagement}
                        onClose={() => setShowAuthManagement(false)}
                        lang={lang}
                        authAzureEnabled={authAzureEnabled}
                        setAuthAzureEnabled={setAuthAzureEnabled}
                        authAzureTenant={authAzureTenant}
                        setAuthAzureTenant={setAuthAzureTenant}
                        authAzureClientId={authAzureClientId}
                        setAuthAzureClientId={setAuthAzureClientId}
                        authAzureClientSecret={authAzureClientSecret}
                        setAuthAzureClientSecret={setAuthAzureClientSecret}
                        authLdapEnabled={authLdapEnabled}
                        setAuthLdapEnabled={setAuthLdapEnabled}
                        authLdapUrl={authLdapUrl}
                        setAuthLdapUrl={setAuthLdapUrl}
                        authLdapBindDn={authLdapBindDn}
                        setAuthLdapBindDn={setAuthLdapBindDn}
                        authLdapBindPassword={authLdapBindPassword}
                        setAuthLdapBindPassword={setAuthLdapBindPassword}
                        authLdapSearchBase={authLdapSearchBase}
                        setAuthLdapSearchBase={setAuthLdapSearchBase}
                        authLdapFilter={authLdapFilter}
                        setAuthLdapFilter={setAuthLdapFilter}
                    />
                    <ReassignUserDialog
                        isOpen={reassignState.isOpen}
                        onClose={() => setReassignState({ ...reassignState, isOpen: false })}
                        tasks={reassignState.tasks}
                        users={users.filter(u => u.id)} // Only existing users
                        groups={availableGroups}
                        onConfirm={handleConfirmReassign}
                        deletedUserName={reassignState.user?.username}
                        lang={lang}
                    />
                    <UserDetailsDialog
                        isOpen={editDetailsIndex !== null}
                        onClose={() => setEditDetailsIndex(null)}
                        user={editDetailsIndex !== null ? users[editDetailsIndex] : null}
                        lang={lang}
                        onSave={(details) => {
                            const n = [...users];
                            n[editDetailsIndex] = { ...n[editDetailsIndex], ...details };
                            setUsers(n);
                            setEditDetailsIndex(null);
                        }}
                    />

                    <Dialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
                        <DialogContent className="sm:max-w-[425px]">
                            <DialogHeader>
                                <DialogTitle>{t(lang, "confirmDeleteTitle") || "Are you sure?"}</DialogTitle>
                                <div className="text-sm text-muted-foreground pt-2">
                                    {t(lang, "confirmDeleteUserDesc") || "This action will remove the user from the list."}
                                    {userToDelete && <div className="mt-2 text-foreground font-medium">{userToDelete.user.username}</div>}
                                </div>
                            </DialogHeader>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setUserToDelete(null)}>
                                    {t(lang, "cancel")}
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={() => {
                                        if (userToDelete) {
                                            handleDeleteUser(userToDelete.index);
                                            setUserToDelete(null);
                                        }
                                    }}
                                >
                                    {t(lang, "delete") || "Delete"}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                </DialogContent>
            </Dialog>

            <AddUserDialog
                isOpen={showAddUserDialog}
                onClose={() => setShowAddUserDialog(false)}
                onSave={(newUser) => {
                    setUsers([...users, newUser]);
                }}
                authAzureEnabled={authAzureEnabled}
                authLdapEnabled={authLdapEnabled}
                lang={lang}
            />

            <Dialog open={showRestoreConfirm} onOpenChange={setShowRestoreConfirm}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>{t(lang, "backupRestore")}</DialogTitle>
                        <DialogDescription>
                            {t(lang, "backupRestoreConfirm")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4 space-y-4">
                        {restoreFile && (
                            <div className="flex items-center gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm w-full overflow-hidden">
                                <Database className="h-4 w-4 shrink-0" />
                                <span className="font-mono truncate flex-1 min-w-0 max-w-[200px] sm:max-w-[300px]" title={restoreFile.name}>{restoreFile.name}</span>
                            </div>
                        )}

                        {showRestorePasswordInput && (
                            <div className="space-y-2">
                                <Label className="text-rose-600 font-medium">Password Required</Label>
                                <Input
                                    type="password"
                                    value={restorePassword}
                                    onChange={(e) => setRestorePassword(e.target.value)}
                                    placeholder="Enter backup password"
                                />
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRestoreConfirm(false)}>{t(lang, "cancel")}</Button>
                        <Button onClick={executeRestore} disabled={loading}>{loading ? t(lang, "backupRestoring") : t(lang, "confirm")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={showBackupOptions} onOpenChange={setShowBackupOptions}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>{t(lang, "backupOptionsTitle")}</DialogTitle>
                        <DialogDescription>{t(lang, "backupDesc")}</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>{t(lang, "autoBackupPassword")}</Label>
                            <Input
                                type="password"
                                placeholder={t(lang, "autoBackupPasswordPlaceholder")}
                                value={backupPassword}
                                onChange={e => setBackupPassword(e.target.value)}
                            />
                        </div>
                        <Button
                            variant="outline"
                            className="justify-start h-auto py-3 px-4"
                            onClick={() => confirmDownloadBackup('json')}
                        >
                            <div className="flex flex-col items-start text-left">
                                <span className="font-semibold">{t(lang, "backupJsonOnly")}</span>
                                <span className="text-xs text-slate-500 font-normal">Database only</span>
                            </div>
                        </Button>
                        <Button
                            variant="outline"
                            className="justify-start h-auto py-3 px-4"
                            onClick={() => confirmDownloadBackup('zip')}
                        >
                            <div className="flex flex-col items-start text-left">
                                <span className="font-semibold">{t(lang, "backupFullZip")}</span>
                                <span className="text-xs text-slate-500 font-normal">{t(lang, "backupIncludeFiles")}</span>
                            </div>
                        </Button>
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setShowBackupOptions(false)}>{t(lang, "cancel")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
