import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { t } from "@/lib/constants";
import { apiFetch } from "@/lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Edit, Plus, Clock, CalendarDays, Info } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";

export function HNOSettingsDialog({ isOpen, onClose, lang }) {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);

    // Inner Dialog Config
    const [showEdit, setShowEdit] = useState(false);
    const [editingGroup, setEditingGroup] = useState(null); // null = new

    // Edit Form State
    const [name, setName] = useState("");
    const [days, setDays] = useState([]); // Array of strings "0".."6"
    const [startTime, setStartTime] = useState("20:00");
    const [endTime, setEndTime] = useState("05:00");

    const [groupToDelete, setGroupToDelete] = useState(null);

    useEffect(() => {
        if (isOpen) {
            fetchGroups();
        }
    }, [isOpen]);



    const fetchGroups = async () => {
        try {
            const res = await apiFetch("/api/hno/groups");
            if (res.ok) {
                const data = await res.json();
                setGroups(data);
            }
        } catch (e) { console.error(e); }
    };



    const openEdit = (g = null) => {
        setEditingGroup(g);
        if (g) {
            setName(g.name);
            setDays(g.days.split(','));
            setStartTime(g.start_time);
            setEndTime(g.end_time);
        } else {
            setName("");
            setDays([]);
            setStartTime("20:00");
            setEndTime("05:00");
        }
        setShowEdit(true);
    };

    const handleSaveGroup = async () => {
        const body = {
            name,
            days: days.join(','),
            start_time: startTime,
            end_time: endTime
        };
        const method = editingGroup ? "PUT" : "POST";
        const url = editingGroup ? `/api/hno/groups/${editingGroup.id}` : "/api/hno/groups";

        try {
            const res = await apiFetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                throw new Error(d.error || "Failed to save group");
            }
            setShowEdit(false);
            fetchGroups();
        } catch (e) {
            console.error(e);
            alert("Erreur: " + e.message);
        }
    };

    const handleDelete = async () => {
        if (!groupToDelete) return;
        try {
            await apiFetch(`/api/hno/groups/${groupToDelete.id}`, { method: "DELETE" });
            fetchGroups();
            setGroupToDelete(null);
        } catch (e) { console.error(e); }
    };

    // Days config
    const dayLabels = {
        1: "Lun", 2: "Mar", 3: "Mer", 4: "Jeu", 5: "Ven", 6: "Sam", 0: "Dim"
    };
    const dayOrder = ["1", "2", "3", "4", "5", "6", "0"];

    const toggleDay = (d) => {
        if (days.includes(d)) setDays(days.filter(x => x !== d));
        else setDays([...days, d]);
    };

    const getPreviewText = () => {
        if (days.length === 0 || !startTime || !endTime) return "";
        const [sH, sM] = startTime.split(':').map(Number);
        const [eH, eM] = endTime.split(':').map(Number);
        if (isNaN(sH) || isNaN(eH)) return "";

        const crossDay = (eH < sH) || (eH === sH && eM < sM);

        // Find first selected day for example
        const firstDayCode = dayOrder.find(d => days.includes(d));
        if (!firstDayCode) return "";

        const labelMap = {
            "1": t(lang, "monday") || "Lundi",
            "2": t(lang, "tuesday") || "Mardi",
            "3": t(lang, "wednesday") || "Mercredi",
            "4": t(lang, "thursday") || "Jeudi",
            "5": t(lang, "friday") || "Vendredi",
            "6": t(lang, "saturday") || "Samedi",
            "0": t(lang, "sunday") || "Dimanche"
        };

        const dayName = labelMap[firstDayCode];
        let endDayName = dayName;

        if (crossDay) {
            const nextCode = String((parseInt(firstDayCode) + 1) % 7);
            endDayName = labelMap[nextCode];
        }

        return `Ex: ${dayName} ${startTime} -> ${endDayName} ${endTime}`;
    };

    // If main feature disabled, show overlay or message?
    // User wants "activate/disable" feature inside.

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[700px] h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{t(lang, "hnoTitle")}</DialogTitle>
                        <DialogDescription className="hidden">HNO Settings Configuration</DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto py-4">
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <h3 className="text-lg font-semibold">{t(lang, "hnoGroups")}</h3>
                                <Button size="sm" onClick={() => openEdit(null)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t(lang, "addHNOGroup")}
                                </Button>
                            </div>

                            <div className="border rounded-md">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>{t(lang, "hnoName")}</TableHead>
                                            <TableHead>{t(lang, "hnoDays")}</TableHead>
                                            <TableHead>{t(lang, "hnoStart")}/{t(lang, "hnoEnd")}</TableHead>
                                            <TableHead className="w-[100px]"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {groups.map(g => (
                                            <TableRow key={g.id}>
                                                <TableCell className="font-medium">{g.name}</TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1 flex-wrap">
                                                        {dayOrder.filter(d => g.days.split(',').includes(d)).map(d => (
                                                            <Badge key={d} variant="outline" className="text-xs px-1">
                                                                {dayLabels[d]}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1 text-sm">
                                                        <Clock className="h-3 w-3 text-muted-foreground" />
                                                        {g.start_time} - {g.end_time}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1 justify-end">
                                                        <Button size="icon" variant="ghost" onClick={() => openEdit(g)}>
                                                            <Edit className="h-4 w-4" />
                                                        </Button>
                                                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => setGroupToDelete(g)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {groups.length === 0 && (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground h-24">
                                                    No groups defined
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Inner Dialog for Add/Edit Group */}
            <Dialog open={showEdit} onOpenChange={setShowEdit}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>{editingGroup ? t(lang, "edit") : t(lang, "addHNOGroup")}</DialogTitle>
                        <DialogDescription className="hidden">Edit HNO Group Details</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>{t(lang, "hnoName")}</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Equipe Nuit VSD" />
                        </div>
                        <div className="space-y-2">
                            <Label>{t(lang, "hnoDays")}</Label>
                            <div className="flex gap-2 justify-center">
                                {dayOrder.map(d => (
                                    <div
                                        key={d}
                                        onClick={() => toggleDay(d)}
                                        className={`
                                            w-8 h-8 rounded-full flex items-center justify-center cursor-pointer text-xs font-bold transition-all
                                            ${days.includes(d) ? 'bg-primary text-primary-foreground' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'}
                                        `}
                                    >
                                        {dayLabels[d]}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{t(lang, "hnoStart")}</Label>
                                <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                            </div>
                            <div className="space-y-2">
                                <Label>{t(lang, "hnoEnd")}</Label>
                                <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                            </div>
                            <div className="col-span-2 bg-slate-100 dark:bg-slate-800 p-2 rounded text-sm text-slate-600 dark:text-slate-300 flex items-center gap-2">
                                <Info size={16} />
                                <span>{getPreviewText() || "Sélectionnez des jours et horaires..."}</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowEdit(false)}>{t(lang, "cancel")}</Button>
                        <Button onClick={handleSaveGroup}>{t(lang, "save")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!groupToDelete} onOpenChange={() => setGroupToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t(lang, "confirmDelete")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this group? Tasks using it might be affected.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t(lang, "cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            {t(lang, "delete")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
