import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea"; // Assuming we have or use Input for desc
import { t } from "@/lib/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload } from "lucide-react";
import { apiFetch } from "@/lib/api";

export function EditTaskDialog({ isOpen, onClose, lang, task = null, onSaved }) {
    const isEdit = !!task;

    const [periodicity, setPeriodicity] = useState("daily");
    const [description, setDescription] = useState("");
    const [procUrl, setProcUrl] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [activeUntil, setActiveUntil] = useState("");
    const [uploadMode, setUploadMode] = useState("url"); // 'url' or 'file'

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = React.useRef(null);

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const fd = new FormData();
        fd.append("file", file);

        setLoading(true);
        try {
            const token = localStorage.getItem("checklist_auth_token");
            const res = await fetch("/api/upload", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token },
                body: fd
            });
            const data = await res.json();
            if (res.ok) {
                setProcUrl(data.url);
            } else {
                setError(data.error || "Upload failed");
            }
        } catch (e) {
            setError("Upload error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            if (task) {
                setPeriodicity(task.periodicity || "daily");
                setDescription(task.description || "");
                setProcUrl(task.procedure_url || "");
                setStartDate(task.start_date || "");
                setEndDate(task.end_date || "");
                setActiveUntil(task.active_until || "");
                setUploadMode("url"); // Default to URL, user can switch if they want to upload new
            } else {
                // Default for new
                setPeriodicity("daily");
                setDescription("");
                setProcUrl("");
                setStartDate(new Date().toISOString().split('T')[0]);
                setEndDate("");
                setActiveUntil("");
                setUploadMode("url");
            }
            setError("");
        }
    }, [isOpen, task]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const body = {
                periodicity,
                description,
                procedure_url: procUrl,
                start_date: startDate,
                end_date: endDate,
                active_until: activeUntil
            };

            let url = "/api/tasks";
            let method = "POST";

            if (isEdit) {
                url = `/api/tasks/${task.id}`; // Note: legacy uses .id or ._id? Task model usually id. 
                // Let's check TaskItem usage. It uses it._id
                // Wait, legacy app.js update logic uses id? 
                // Legacy server TaskController uses req.params.id and db uses id. 
                // The API likely expects the ID in URL.
                // Task object in front has _id? Or id? 
                // SQLite usually returns id. 
                // Let's assume id from the backend Task object.
                url = `/api/tasks/${task.id}`;
                method = "PUT";
            }

            const res = await apiFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                onSaved();
                onClose();
            } else {
                const d = await res.json().catch(() => ({}));
                setError(d.error || "Save failed");
            }
        } catch (e) {
            setError("Network error: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]"
                onPointerDownOutside={e => e.preventDefault()}
                onEscapeKeyDown={e => e.preventDefault()}>
                <DialogHeader>
                    <DialogTitle>
                        {isEdit ? t(lang, "editTaskTitle") : t(lang, "adminCreate")}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4 py-2">
                    <div className="space-y-2">
                        <Label>{t(lang, "choosePeriodicity")}</Label>
                        <Select value={periodicity} onValueChange={setPeriodicity} disabled={isEdit}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="daily">{t(lang, "daily")}</SelectItem>
                                <SelectItem value="weekly">{t(lang, "weekly")}</SelectItem>
                                <SelectItem value="monthly">{t(lang, "monthly")}</SelectItem>
                                <SelectItem value="yearly">{t(lang, "yearly")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>{t(lang, "description")}</Label>
                        <Input value={description} onChange={e => setDescription(e.target.value)} required />
                    </div>

                    <div className="space-y-2">
                        <Label>{t(lang, "procLink")}</Label>
                        <Tabs value={uploadMode} onValueChange={setUploadMode} className="w-full">
                            <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="url">URL</TabsTrigger>
                                <TabsTrigger value="file">{t(lang, "proc")}</TabsTrigger>
                            </TabsList>
                            <TabsContent value="url">
                                <Input value={procUrl} onChange={e => setProcUrl(e.target.value)} placeholder="https://" />
                            </TabsContent>
                            <TabsContent value="file">
                                <div className="flex gap-2">
                                    <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} className="w-full">
                                        <Upload className="mr-2 h-4 w-4" />
                                        {t(lang, "chooseFile")}
                                    </Button>
                                    <Input
                                        ref={fileInputRef}
                                        type="file"
                                        className="hidden"
                                        onChange={handleFileUpload}
                                        accept=".pdf,.doc,.docx,.txt"
                                    />
                                </div>
                                {procUrl && procUrl.startsWith("/uploads") && (
                                    <div className="text-xs text-slate-500 mt-1 truncate">
                                        Current: {procUrl.split('/').pop()}
                                    </div>
                                )}
                            </TabsContent>
                        </Tabs>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>{t(lang, "startDate")}</Label>
                            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                        </div>
                        {periodicity === 'yearly' && (
                            <div className="space-y-2">
                                <Label>{t(lang, "endDateYearly")}</Label>
                                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                            </div>
                        )}
                    </div>

                    {isEdit && (
                        <div className="space-y-2">
                            <Label>{t(lang, "activeUntilLabel")}</Label>
                            <Input type="date" value={activeUntil} onChange={e => setActiveUntil(e.target.value)} />
                        </div>
                    )}

                    {error && <div className="text-sm text-rose-500">{error}</div>}

                    <DialogFooter className="gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>
                            {t(lang, "cancel")}
                        </Button>
                        <Button type="submit" disabled={loading}>
                            {isEdit ? t(lang, "paramsSave") : t(lang, "create")}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
