import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { t } from "@/lib/constants";
import { Mail, Bell, Users, UserPlus, Check } from 'lucide-react';

export function EmailSettingsTab({
    lang,
    mailEnabled,
    setMailEnabled,
    smtpHost,
    setSmtpHost,
    smtpPort,
    setSmtpPort,
    smtpSecure,
    setSmtpSecure,
    smtpUser,
    setSmtpUser,
    smtpPass,
    setSmtpPass,
    mailFrom,
    setMailFrom,
    mailTo,
    setMailTo,
    mailMissing,
    setMailMissing,
    mailMissingRecipients,
    setMailMissingRecipients,
    mailReminderEnabled,
    setMailReminderEnabled,
    mailReminderRecipients,
    setMailReminderRecipients,
    mailCustomEmails,
    setMailCustomEmails,
    handleTestMail,
    mailReminderOffsetHours,
    setMailReminderOffsetHours,
    mailReminderOffsetMinutes,
    setMailReminderOffsetMinutes
}) {
    const toggleRecipient = (type, list, setList) => {
        const current = list || [];
        if (current.includes(type)) {
            setList(current.filter(r => r !== type));
        } else {
            setList([...current, type]);
        }
    };

    const RecipientSelector = ({ recipients, setRecipients, label }) => {
        const options = [
            { value: 'admin', label: t(lang, 'admin') || 'Admin', icon: Users },
            { value: 'assigned', label: t(lang, 'assignedUsers') || 'Assigned Users', icon: UserPlus },
            { value: 'custom', label: t(lang, 'custom') || 'Custom', icon: Mail }
        ];

        return (
            <div className="space-y-2">
                <Label>{label}</Label>
                <div className="flex flex-wrap gap-2">
                    {options.map(opt => {
                        const Icon = opt.icon;
                        const isSelected = (recipients || []).includes(opt.value);
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                onClick={() => toggleRecipient(opt.value, recipients, setRecipients)}
                                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-all ${isSelected
                                    ? 'border-primary bg-primary text-white shadow-md'
                                    : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 text-slate-700 dark:text-slate-200'
                                    }`}
                            >
                                <Icon className="h-4 w-4" />
                                <span className="text-sm font-medium">{opt.label}</span>
                                {isSelected && <Check className="h-4 w-4" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Enable Email */}
            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-primary" />
                    <Label className="text-base font-semibold">{t(lang, "emailNotifLegend")}</Label>
                </div>
                <Switch checked={mailEnabled} onCheckedChange={setMailEnabled} />
            </div>

            {mailEnabled && (
                <>
                    {/* SMTP Configuration */}
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">
                            {t(lang, "smtpConfiguration")}
                        </h3>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="smtp-host">{t(lang, "smtpHost")}</Label>
                                <Input id="smtp-host" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="smtp-port">{t(lang, "smtpPort")}</Label>
                                <Input id="smtp-port" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <Switch checked={smtpSecure} onCheckedChange={setSmtpSecure} id="secure" />
                            <Label htmlFor="secure">{t(lang, "smtpSecure")}</Label>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="smtp-user">{t(lang, "smtpUser")}</Label>
                                <Input id="smtp-user" value={smtpUser} onChange={e => setSmtpUser(e.target.value)} autoComplete="off" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="smtp-pass">{t(lang, "smtpPass")}</Label>
                                <Input id="smtp-pass" type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="mail-from">{t(lang, "mailFrom")}</Label>
                                <Input id="mail-from" value={mailFrom} onChange={e => setMailFrom(e.target.value)} placeholder="noreply@example.com" autoComplete="email" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="mail-to">{t(lang, "mailTo")} ({t(lang, "fallback")})</Label>
                                <Input id="mail-to" value={mailTo} onChange={e => setMailTo(e.target.value)} placeholder="admin@example.com" autoComplete="email" />
                            </div>
                        </div>

                        <div className="pt-2">
                            <Button type="button" variant="outline" size="sm" onClick={handleTestMail}>
                                <Mail className="mr-2 h-4 w-4" />
                                {t(lang, "testSmtp")}
                            </Button>
                        </div>
                    </div>

                    {/* Missing Tasks Notifications */}
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                    <Mail className="h-5 w-5 text-red-600 dark:text-red-400" />
                                </div>
                                <div>
                                    <Label className="text-base font-semibold">{t(lang, "emailMissingEnable") || "Send email for missing tasks"}</Label>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        {t(lang, "checkedEvery15Minutes")}
                                    </p>
                                </div>
                            </div>
                            <Switch checked={mailMissing} onCheckedChange={setMailMissing} id="missing" />
                        </div>

                        {mailMissing && (
                            <div className="pl-4 space-y-4 p-4 bg-white dark:bg-slate-700 rounded-lg">
                                <RecipientSelector
                                    recipients={mailMissingRecipients}
                                    setRecipients={setMailMissingRecipients}
                                    label={t(lang, 'recipients') || "Recipients"}
                                />

                                {(mailMissingRecipients || []).includes('custom') && (
                                    <div className="space-y-2">
                                        <Label htmlFor="missing-custom-emails">{t(lang, 'customEmails') || "Custom Emails"}</Label>
                                        <Input
                                            id="missing-custom-emails"
                                            value={mailCustomEmails}
                                            onChange={e => setMailCustomEmails(e.target.value)}
                                            placeholder="email1@example.com, email2@example.com"
                                            autoComplete="email"
                                        />
                                        <p className="text-xs text-slate-500">{t(lang, "separateEmailsComma")}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Task Reminders */}
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                    <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                </div>
                                <div>
                                    <Label className="text-base font-semibold">{t(lang, "emailReminderEnable") || "Send reminder 1 hour before task"}</Label>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                        {t(lang, "checkedEvery10Minutes")}
                                    </p>
                                </div>
                            </div>
                            <Switch checked={mailReminderEnabled} onCheckedChange={setMailReminderEnabled} id="reminder" />
                        </div>

                        {mailReminderEnabled && (
                            <div className="pl-4 space-y-4 p-4 bg-white dark:bg-slate-700 rounded-lg">
                                <RecipientSelector
                                    recipients={mailReminderRecipients}
                                    setRecipients={setMailReminderRecipients}
                                    label={t(lang, 'recipients') || "Recipients"}
                                />

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label htmlFor="offset-hours">{t(lang, 'offsetHours') || "Hours before"}</Label>
                                        <Input
                                            id="offset-hours"
                                            type="number"
                                            min="0"
                                            max="24"
                                            value={mailReminderOffsetHours}
                                            onChange={e => setMailReminderOffsetHours(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label htmlFor="offset-minutes">{t(lang, 'offsetMinutes') || "Minutes before"}</Label>
                                        <Input
                                            id="offset-minutes"
                                            type="number"
                                            min="0"
                                            max="59"
                                            value={mailReminderOffsetMinutes}
                                            onChange={e => setMailReminderOffsetMinutes(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                </div>

                                {(mailReminderRecipients || []).includes('custom') && (
                                    <div className="space-y-2">
                                        <Label htmlFor="reminder-custom-emails">{t(lang, 'customEmails') || "Custom Emails"}</Label>
                                        <Input
                                            id="reminder-custom-emails"
                                            value={mailCustomEmails}
                                            onChange={e => setMailCustomEmails(e.target.value)}
                                            placeholder="email1@example.com, email2@example.com"
                                            autoComplete="email"
                                        />
                                        <p className="text-xs text-slate-500">{t(lang, "separateEmailsComma")}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
