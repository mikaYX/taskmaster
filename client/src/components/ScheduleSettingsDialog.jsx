import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/constants";
import { apiFetch } from "@/lib/api";
import { Clock, Users, Settings } from "lucide-react";

const DEFAULT_SCHEDULE = {
    mode: "global",
    global: { start: "08:00", end: "19:00" },
    daily: { start: "08:00", end: "19:00" },
    weekly: { start: "08:00", end: "19:00" },
    monthly: { start: "08:00", end: "19:00" },
    yearly: { start: "08:00", end: "19:00" }
};

export function ScheduleSettingsDialog({ isOpen, onClose, lang, onManageHno, onConfigUpdate }) {
    const [loading, setLoading] = useState(false);
    const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
    const [hnoEnabled, setHnoEnabled] = useState(false);

    useEffect(() => {
        if (isOpen) fetchConfig();
    }, [isOpen]);

    const fetchConfig = async () => {
        try {
            const res = await apiFetch("/api/config");
            if (res.ok) {
                const conf = await res.json();

                // Robust merge
                const merged = { ...DEFAULT_SCHEDULE };
                if (conf.sys_schedule) {
                    // Start with mode
                    if (conf.sys_schedule.mode) merged.mode = conf.sys_schedule.mode;

                    // Merge each periodicity object carefully
                    ['global', 'daily', 'weekly', 'monthly', 'yearly'].forEach(k => {
                        if (conf.sys_schedule[k]) {
                            merged[k] = { ...merged[k], ...conf.sys_schedule[k] };
                        }
                    });
                }
                setSchedule(merged);

                setHnoEnabled(conf.feature_hno_enabled === 'true');
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleSave = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sys_schedule: schedule,
                    feature_hno_enabled: hnoEnabled ? 'true' : 'false'
                })
            });

            if (!res.ok) throw new Error("Failed to save settings");

            // Notify App to reload config (for feature toggles etc)
            if (onConfigUpdate) onConfigUpdate();

            onClose();
        } catch (e) {
            alert("Error saving: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const updateSchedule = (key, field, value) => {
        setSchedule(prev => ({
            ...prev,
            [key]: {
                ...prev[key],
                [field]: value
            }
        }));
    };

    const TimeRow = ({ title, objKey }) => (
        <div className="grid grid-cols-3 gap-4 items-center border-b border-slate-100 dark:border-slate-800 pb-3 last:border-0 last:pb-0">
            <Label className="font-semibold text-slate-700 dark:text-slate-300">{title}</Label>
            <div className="space-y-1">
                <Label className="text-xs text-slate-500">{t(lang, "hnoStart")}</Label>
                <Input
                    type="time"
                    value={schedule[objKey]?.start || "08:00"}
                    onChange={e => updateSchedule(objKey, "start", e.target.value)}
                />
            </div>
            <div className="space-y-1">
                <Label className="text-xs text-slate-500">{t(lang, "hnoEnd")}</Label>
                <Input
                    type="time"
                    value={schedule[objKey]?.end || "19:00"}
                    onChange={e => updateSchedule(objKey, "end", e.target.value)}
                />
            </div>
        </div>
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Settings className="w-5 h-5 text-slate-500" />
                        {t(lang, "scheduleSettingsTitle")}
                    </DialogTitle>
                    <DialogDescription className="hidden">Configure System Schedule and HNO</DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-8">
                    {/* HNO Section */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            {t(lang, "hnoTitle")}
                        </h3>
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base">{t(lang, "enableHNO")}</Label>
                                <Switch
                                    checked={hnoEnabled}
                                    onCheckedChange={setHnoEnabled}
                                />
                            </div>

                            {hnoEnabled && (
                                <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                                    <Button variant="outline" className="w-full" onClick={onManageHno}>
                                        <Users className="w-4 h-4 mr-2" />
                                        {t(lang, "hnoGroups")}
                                    </Button>
                                    <p className="text-xs text-slate-500 mt-2 text-center">
                                        {t(lang, "manageHnoTeamsDesc") || (lang === 'FR' ? "Gérer les équipes et horaires décalés." : "Manage teams and shifts for After Hours tasks.")}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Schedule Section */}
                    <div className="space-y-4">
                        <h3 className="text-sm font-medium uppercase tracking-wider text-slate-500 border-b pb-2 flex items-center gap-2">
                            <Clock className="w-4 h-4" />
                            {t(lang, "scheduleParams")}
                        </h3>

                        {/* Global Toggle */}
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-800 mb-4">
                            <div className="space-y-0.5">
                                <Label className="text-base">{t(lang, "scheduleGlobalMode")}</Label>
                                <p className="text-xs text-slate-500">{t(lang, "scheduleGlobalDesc")}</p>
                            </div>
                            <Switch
                                checked={schedule.mode === 'global'}
                                onCheckedChange={(chk) => setSchedule(prev => ({ ...prev, mode: chk ? 'global' : 'specific' }))}
                            />
                        </div>

                        {/* Times */}
                        {schedule.mode === 'global' ? (
                            <TimeRow title={t(lang, "scheduleGlobalMode")} objKey="global" />
                        ) : (
                            <div className="space-y-4">
                                <TimeRow title={t(lang, "schedDaily")} objKey="daily" />
                                <TimeRow title={t(lang, "schedWeekly")} objKey="weekly" />
                                <TimeRow title={t(lang, "schedMonthly")} objKey="monthly" />
                                <TimeRow title={t(lang, "schedYearly")} objKey="yearly" />
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={loading}>{t(lang, "cancel")}</Button>
                    <Button onClick={handleSave} disabled={loading}>{t(lang, "save")}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
