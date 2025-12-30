import React from 'react';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/lib/constants";
import { Database, Download, Upload, FileText, Users, Mail, Check } from 'lucide-react';

export function ExportSettingsTab({
    lang,
    exportEnabled,
    setExportEnabled,
    exportFormatCsv,
    setExportFormatCsv,
    exportFormatPdf,
    setExportFormatPdf,
    exportMode,
    setExportMode,
    exportTime,
    setExportTime,
    exportDayOfWeek,
    setExportDayOfWeek,
    exportMonthlyMode,
    setExportMonthlyMode,
    exportMonthlyDay,
    setExportMonthlyDay,
    exportMonthlyRank,
    setExportMonthlyRank,
    exportMonthlyDow,
    setExportMonthlyDow,
    exportCustomCron,
    setExportCustomCron,
    cronPreview,
    effectiveCron,
    exportDir,
    setExportDir,
    exportOffsetFrom,
    setExportOffsetFrom,
    exportOffsetTo,
    setExportOffsetTo,
    exportRetention,
    setExportRetention,
    mailExportEnabled,
    setMailExportEnabled,
    mailExportCsv,
    setMailExportCsv,
    mailExportPdf,
    setMailExportPdf,
    mailEnabled,
    handleTestExport,
    handleTestExportMail,
    onDownloadBackup,
    onRestoreBackup,

    // Auto Backup props
    autoBackupEnabled, setAutoBackupEnabled,
    autoBackupCron, setAutoBackupCron,
    autoBackupType, setAutoBackupType,
    autoBackupPassword, setAutoBackupPassword,

    // Auto Backup Frequency props
    autoBackupMode, setAutoBackupMode,
    autoBackupTime, setAutoBackupTime,
    autoBackupDayOfWeek, setAutoBackupDayOfWeek,
    autoBackupCustomCron, setAutoBackupCustomCron,
    autoBackupPreview,
    effectiveAutoCron,
    autoBackupRetentionCount, setAutoBackupRetentionCount,
    mailExportRecipients, setMailExportRecipients,
    mailCustomEmails, setMailCustomEmails
}) {
    const RecipientSelectorExport = ({ recipients, setRecipients, label }) => {
        const options = [
            { value: 'admin', label: t(lang, 'admin') || 'Admin', icon: Users },
            { value: 'custom', label: t(lang, 'custom') || 'Custom', icon: Mail }
        ];

        const toggleRecipient = (type) => {
            const current = recipients || [];
            if (current.includes(type)) {
                setRecipients(current.filter(r => r !== type));
            } else {
                setRecipients([...current, type]);
            }
        };

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
                                onClick={() => toggleRecipient(opt.value)}
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
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-semibold">{t(lang, "autoExportLegend")}</h3>
                </div>
                <Switch checked={exportEnabled} onCheckedChange={setExportEnabled} />
            </div>
            {exportEnabled && (
                <>
                    {/* Export Formats */}
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
                        {/* Frequency & Time */}
                        <div className="flex gap-4">
                            <div className="flex-1 space-y-2">
                                <Label htmlFor="export-freq">{t(lang, "autoExportFreq")}</Label>
                                <Select value={exportMode} onValueChange={setExportMode}>
                                    <SelectTrigger id="export-freq"><SelectValue /></SelectTrigger>
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
                                    <Label htmlFor="export-time">{t(lang, "exportTime")}</Label>
                                    <Input id="export-time" type="time" value={exportTime} onChange={e => setExportTime(e.target.value)} />
                                </div>
                            )}
                        </div>

                        {/* Weekly Day Selection */}
                        {exportMode === "week" && (
                            <div className="w-full space-y-2">
                                <Label htmlFor="export-dow">{t(lang, "exportDayOfWeek")}</Label>
                                <Select value={exportDayOfWeek} onValueChange={setExportDayOfWeek}>
                                    <SelectTrigger id="export-dow"><SelectValue /></SelectTrigger>
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

                        {/* Monthly Configuration */}
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

                        {/* Custom Cron */}
                        {exportMode === "custom" && (
                            <div className="space-y-2">
                                <Label>Cron Expression</Label>
                                <Input value={exportCustomCron} onChange={e => setExportCustomCron(e.target.value)} placeholder="30 19 * * *" className="font-mono" />
                                <div className="text-xs text-slate-500">min hour day month dow</div>
                            </div>
                        )}

                        {/* Cron Preview */}
                        <div className="text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                            {cronPreview?.valid ? (
                                <>
                                    <span className="font-semibold text-primary">{effectiveCron}</span>
                                    <span className="mx-2">&rarr;</span>
                                    <span>{new Date(cronPreview.next).toLocaleString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'long', timeStyle: 'short' })}</span>
                                </>
                            ) : cronPreview !== null && cronPreview !== undefined ? (
                                <span className="text-red-500">
                                    {cronPreview.error || "Invalid cron expression"}
                                </span>
                            ) : (
                                <span className="text-slate-400">
                                    {t(lang, "loading")}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Export Directory */}
                    <div className="space-y-2">
                        <Label htmlFor="export-dir">{t(lang, "exportDir")}</Label>
                        <Input id="export-dir" value={exportDir} onChange={e => setExportDir(e.target.value)} />
                    </div>

                    {/* Offset */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="offset-from">{t(lang, "offsetFrom")}</Label>
                            <Input id="offset-from" type="number" min="0" value={exportOffsetFrom} onChange={e => setExportOffsetFrom(parseInt(e.target.value) || 0)} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="offset-to">{t(lang, "offsetTo")}</Label>
                            <Input id="offset-to" type="number" min="0" value={exportOffsetTo} onChange={e => setExportOffsetTo(parseInt(e.target.value) || 0)} />
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="text-sm text-slate-500 bg-slate-100 dark:bg-slate-900 p-2 rounded">
                        <p>
                            <strong>{t(lang, 'preview')}:</strong> {t(lang, 'previewIntro')}
                        </p>
                        <p className="font-mono mt-1">
                            {t(lang, 'from')} {new Date(Date.now() - (exportOffsetFrom * 86400000)).toLocaleDateString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })} <br />
                            {t(lang, 'to')} {new Date(Date.now() - (exportOffsetTo * 86400000)).toLocaleDateString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'short' })}
                        </p>
                    </div>

                    {/* Retention */}
                    <div className="space-y-2">
                        <Label htmlFor="retention-select">{t(lang, "cleanupRetentionLabel")}</Label>
                        <Select value={String(exportRetention)} onValueChange={v => setExportRetention(parseInt(v) || 0)}>
                            <SelectTrigger id="retention-select"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="0">{t(lang, "retentionNever")}</SelectItem>
                                <SelectItem value="30">{t(lang, "retention1Month")}</SelectItem>
                                <SelectItem value="180">{t(lang, "retention6Months")}</SelectItem>
                                <SelectItem value="365">{t(lang, "retention1Year")}</SelectItem>
                                <SelectItem value="3650">{t(lang, "retention10Years")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Mail Export */}
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

                            <div className="pt-2">
                                <RecipientSelectorExport
                                    recipients={mailExportRecipients}
                                    setRecipients={setMailExportRecipients}
                                    label={t(lang, 'recipients') || "Recipients"}
                                />
                            </div>

                            {(mailExportRecipients || []).includes('custom') && (
                                <div className="space-y-2 pt-2">
                                    <Label htmlFor="export-custom-emails">{t(lang, 'customEmails') || "Custom Emails"}</Label>
                                    <Input
                                        id="export-custom-emails"
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

                    {/* Test Buttons */}
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

            {/* Backup & Restore Section */}
            <div className="pt-6 border-t border-slate-200 dark:border-slate-800 space-y-4">
                <div className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    <h3 className="text-base font-semibold">{t(lang, "backupTitle")}</h3>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                    {t(lang, "backupDesc")}
                </p>
                <div className="flex gap-4">
                    <Button type="button" variant="outline" onClick={onDownloadBackup}>
                        <Download className="mr-2 h-4 w-4" />
                        {t(lang, "backupDownload")}
                    </Button>
                    <Button type="button" variant="outline" onClick={onRestoreBackup}>
                        <Upload className="mr-2 h-4 w-4" />
                        {t(lang, "backupRestore")}
                    </Button>
                </div>
            </div>

            {/* Auto Backup Configuration */}
            <div className="pt-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <Label className="font-semibold">{t(lang, "autoBackupTitle")}</Label>
                        <p className="text-sm text-slate-500">
                            {t(lang, "autoBackupDesc")}
                            <span className="block text-xs font-mono mt-1 text-slate-400">
                                {t(lang, "autoBackupLocation")}: ./backup
                            </span>
                        </p>
                    </div>
                    <Switch checked={autoBackupEnabled} onCheckedChange={setAutoBackupEnabled} id="auto_backup_enabled" />
                </div>

                {autoBackupEnabled && (
                    <div className="space-y-4 p-4 bg-slate-50 dark:bg-slate-900/50 rounded border border-slate-100 dark:border-slate-800">
                        <div className="space-y-4">
                            <div className="flex gap-4">
                                <div className="flex-1 space-y-2">
                                    <Label htmlFor="ab_freq">{t(lang, "autoExportFreq")}</Label>
                                    <Select value={autoBackupMode} onValueChange={setAutoBackupMode}>
                                        <SelectTrigger id="ab_freq"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="day">{t(lang, "autoExportFreqDaily")}</SelectItem>
                                            <SelectItem value="week">{t(lang, "autoExportFreqWeekly")}</SelectItem>
                                            <SelectItem value="custom">Custom (Cron)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {autoBackupMode !== "custom" && (
                                    <div className="w-32 space-y-2">
                                        <Label htmlFor="ab_time">{t(lang, "exportTime")}</Label>
                                        <Input id="ab_time" type="time" value={autoBackupTime} onChange={e => setAutoBackupTime(e.target.value)} />
                                    </div>
                                )}
                            </div>

                            {autoBackupMode === "week" && (
                                <div className="space-y-2">
                                    <Label htmlFor="ab_dow">{t(lang, "exportDayOfWeek")}</Label>
                                    <Select value={autoBackupDayOfWeek} onValueChange={setAutoBackupDayOfWeek}>
                                        <SelectTrigger id="ab_dow"><SelectValue /></SelectTrigger>
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

                            {autoBackupMode === "custom" && (
                                <div className="space-y-2">
                                    <Input
                                        value={autoBackupCustomCron}
                                        onChange={e => setAutoBackupCustomCron(e.target.value)}
                                        placeholder="0 2 * * *"
                                        className="font-mono"
                                    />
                                    <div className="text-xs text-slate-500">min hour day month dow</div>
                                </div>
                            )}

                            {autoBackupMode === "custom" && (
                                <div className="text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                                    {autoBackupPreview?.valid ? (
                                        <>
                                            <span className="font-semibold text-primary">{effectiveAutoCron}</span>
                                            <span className="mx-2">&rarr;</span>
                                            <span>{new Date(autoBackupPreview.next).toLocaleString(lang === "FR" ? "fr-FR" : "en-US", { dateStyle: 'long', timeStyle: 'short' })}</span>
                                        </>
                                    ) : (
                                        <span>{autoBackupPreview?.error || (effectiveAutoCron ? t(lang, "loading") : "")}</span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ab_type">{t(lang, "autoBackupType")}</Label>
                            <Select value={autoBackupType} onValueChange={setAutoBackupType}>
                                <SelectTrigger id="ab_type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="json">{t(lang, "backupJsonOnly")}</SelectItem>
                                    <SelectItem value="zip">{t(lang, "backupFullZip")}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="ab_password">{t(lang, "autoBackupPassword")}</Label>
                            <Input
                                id="ab_password"
                                type="password"
                                value={autoBackupPassword}
                                onChange={e => setAutoBackupPassword(e.target.value)}
                                placeholder={t(lang, "autoBackupPasswordPlaceholder")}
                            />
                            <p className="text-xs text-yellow-600 dark:text-yellow-500">
                                {t(lang, "backupEncryptionWarning")}
                            </p>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="ab_retention_count">{t(lang, "backupRetentionCount")}</Label>
                            <Input
                                id="ab_retention_count"
                                type="number"
                                min="1"
                                max="100"
                                value={autoBackupRetentionCount}
                                onChange={e => setAutoBackupRetentionCount(parseInt(e.target.value) || 1)}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
}
