import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePicker } from "@/components/DatePicker";
import { t } from "@/lib/constants";
import { downloadWithAuth, apiFetch } from "@/lib/api";
import { FileSpreadsheet, FileText, Save, Settings2, Trash2 } from 'lucide-react';

export function ExportDialog({ isOpen, onClose, lang, from: defaultFrom, to: defaultTo, status: defaultStatus, periodicity: defaultPeriodicity }) {
    const [from, setFrom] = useState(defaultFrom || new Date().toISOString().split('T')[0]);
    const [to, setTo] = useState(defaultTo || new Date().toISOString().split('T')[0]);
    const [status, setStatus] = useState(defaultStatus || "all");
    const [periodicity, setPeriodicity] = useState(defaultPeriodicity || "all");
    const [userId, setUserId] = useState("all");
    const [groupId, setGroupId] = useState("all");
    const [search, setSearch] = useState("");
    const [isDelegated, setIsDelegated] = useState(false);

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [presets, setPresets] = useState([]);
    const [newPresetName, setNewPresetName] = useState("");
    const [showManage, setShowManage] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchFilters();
            fetchPresets();
        }
    }, [isOpen]);

    const fetchFilters = async () => {
        try {
            const [uRes, rRes] = await Promise.all([
                apiFetch("/api/users"),
                apiFetch("/api/roles")
            ]);
            if (uRes.ok) setUsers(await uRes.json());
            if (rRes.ok) setRoles(await rRes.json());
        } catch (e) {
            console.error("Fetch export filters error", e);
        }
    };

    const fetchPresets = async () => {
        try {
            const res = await apiFetch("/api/export-filters");
            if (res.ok) setPresets(await res.json());
        } catch (e) {
            console.error("Fetch presets error", e);
        }
    };

    const handleSavePreset = async () => {
        if (!newPresetName.trim()) return;
        try {
            const res = await apiFetch("/api/export-filters", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: newPresetName.trim(),
                    filters: { status, periodicity, userId, groupId, search, isDelegated }
                })
            });
            if (res.ok) {
                setNewPresetName("");
                fetchPresets();
            }
        } catch (e) {
            console.error("Save preset error", e);
        }
    };

    const handleDeletePreset = async (name) => {
        try {
            const res = await apiFetch(`/api/export-filters/${encodeURIComponent(name)}`, {
                method: "DELETE"
            });
            if (res.ok) {
                fetchPresets();
            }
        } catch (e) {
            console.error("Delete preset error", e);
        }
    };

    const applyPreset = (preset) => {
        const { filters } = preset;
        if (filters.status) setStatus(filters.status);
        if (filters.periodicity) setPeriodicity(filters.periodicity);
        if (filters.userId) setUserId(filters.userId);
        if (filters.groupId) setGroupId(filters.groupId);
        if (filters.search !== undefined) setSearch(filters.search);
        if (filters.isDelegated !== undefined) setIsDelegated(!!filters.isDelegated);
    };

    const doExport = (format) => {
        const q = new URLSearchParams({ from, to, status, periodicity, userId, groupId, search, isDelegated });
        const ext = format === 'csv' ? 'csv' : 'pdf';
        const endpoint = `/api/export.${ext}?${q}`;
        downloadWithAuth(endpoint, `export_${from}_${to}.${ext}`);
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle>{t(lang, 'exportTitle') || "Options d'export"}</DialogTitle>
                    <DialogDescription>
                        {t(lang, 'exportDescription') || "Choisissez les filtres pour votre export."}
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    {/* Presets Selection */}
                    {presets.length > 0 && (
                        <div className="space-y-2 pb-2 border-b">
                            <Label className="text-primary font-bold">{t(lang, 'applyPreset')}</Label>
                            <Select onValueChange={(val) => {
                                const p = presets.find(x => x.name === val);
                                if (p) applyPreset(p);
                            }}>
                                <SelectTrigger>
                                    <SelectValue placeholder={t(lang, 'all')} />
                                </SelectTrigger>
                                <SelectContent>
                                    {presets.map(p => (
                                        <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {showManage ? (
                        <div className="space-y-3">
                            <div className="flex justify-between items-center">
                                <Label className="font-bold">{t(lang, 'manageFilters')}</Label>
                                <Button variant="ghost" size="sm" onClick={() => setShowManage(false)}>Retour</Button>
                            </div>
                            <div className="space-y-2">
                                {presets.length === 0 && <p className="text-sm text-slate-500 italic">Aucun filtre enregistré</p>}
                                {presets.map(p => (
                                    <div key={p.name} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded-md">
                                        <span className="text-sm font-medium">{p.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                                            onClick={() => handleDeletePreset(p.name)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t(lang, 'from')}</Label>
                                    <DatePicker date={from} onDateChange={setFrom} lang={lang} />
                                </div>
                                <div className="space-y-2">
                                    <Label>{t(lang, 'to')}</Label>
                                    <DatePicker date={to} onDateChange={setTo} lang={lang} />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>{t(lang, 'choosePeriodicity')}</Label>
                                    <Select value={periodicity} onValueChange={setPeriodicity}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                            <SelectItem value="daily">{t(lang, 'daily')}</SelectItem>
                                            <SelectItem value="weekly">{t(lang, 'weekly')}</SelectItem>
                                            <SelectItem value="monthly">{t(lang, 'monthly')}</SelectItem>
                                            <SelectItem value="yearly">{t(lang, 'yearly')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>{t(lang, 'status')}</Label>
                                    <Select value={status} onValueChange={setStatus}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                            <SelectItem value="pending">{t(lang, 'pending')}</SelectItem>
                                            <SelectItem value="validated">{t(lang, 'validated')}</SelectItem>
                                            <SelectItem value="failed">{t(lang, 'failed')}</SelectItem>
                                            <SelectItem value="missing">{t(lang, 'missing')}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>{t(lang, 'user') || "Utilisateur"}</Label>
                                <Select value={userId} onValueChange={setUserId}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                        {users.map(u => (
                                            <SelectItem key={u.id} value={String(u.id)}>{u.fullname || u.username}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{t(lang, 'group') || "Groupe"}</Label>
                                <Select value={groupId} onValueChange={setGroupId}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                        {roles.map(r => (
                                            <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>{t(lang, 'searchResult')} (Optionnel)</Label>
                                <Input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder={t(lang, 'searchPlaceholder')}
                                    className="h-9"
                                />
                            </div>

                            <div className="flex items-center gap-2 pt-2">
                                <Switch
                                    id="delegated-export"
                                    checked={isDelegated}
                                    onCheckedChange={setIsDelegated}
                                />
                                <Label htmlFor="delegated-export" className="cursor-pointer">
                                    {t(lang, 'delegatedOnly')}
                                </Label>
                            </div>

                            {/* Save Preset Section */}
                            <div className="pt-4 mt-4 border-t space-y-2">
                                <Label className="text-xs text-slate-500 uppercase">{t(lang, 'saveAsPreset')}</Label>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder={t(lang, 'presetNamePlaceholder')}
                                        value={newPresetName}
                                        onChange={e => setNewPresetName(e.target.value)}
                                        className="h-9"
                                    />
                                    <Button size="sm" onClick={handleSavePreset} disabled={!newPresetName.trim()}>
                                        <Save className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <DialogFooter className="flex flex-col gap-4 pt-4 border-t">
                    <div className="flex justify-between items-center w-full">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowManage(!showManage)}
                            className="flex gap-2 text-slate-500 h-8 px-2"
                        >
                            <Settings2 className="h-4 w-4" />
                            <span>{t(lang, 'manageFilters')}</span>
                        </Button>
                    </div>

                    <div className="flex gap-2 w-full sm:justify-end">
                        <Button
                            onClick={() => doExport('csv')}
                            disabled={showManage}
                            className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white flex gap-2 h-10 px-4"
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            {t(lang, 'exportCSV')}
                        </Button>
                        <Button
                            onClick={() => doExport('pdf')}
                            disabled={showManage}
                            className="flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 text-white flex gap-2 h-10 px-4"
                        >
                            <FileText className="h-4 w-4" />
                            {t(lang, 'exportPDF')}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}


