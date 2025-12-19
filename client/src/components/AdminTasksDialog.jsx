import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditTaskDialog } from "./EditTaskDialog";
import { apiFetch } from "@/lib/api";
import { t, PERIOD_COLORS } from "@/lib/constants";
import { Edit, StopCircle, Trash2, Plus } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";

export function AdminTasksDialog({ isOpen, onClose, lang, onTaskUpdated }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editTask, setEditTask] = useState(null); // Task to edit
    const [isEditOpen, setIsEditOpen] = useState(false); // Controls EditTaskDialog

    // Confirmation State
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState({ type: null, task: null }); // type: 'stop' | 'delete'
    const { toast } = useToast();

    const fetchTasks = async () => {
        setLoading(true);
        try {
            const res = await apiFetch("/api/tasks"); // Fetch definitions !!
            if (res.ok) {
                const data = await res.json();
                setTasks(data);
            }
        } catch (e) {
            console.error(e);
            toast({ variant: "destructive", title: "Error", description: "Failed to fetch tasks" });
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchTasks();
        }
    }, [isOpen]);

    const handleEdit = (task) => {
        setEditTask(task);
        setIsEditOpen(true);
    };

    const handleCreate = () => {
        setEditTask(null);
        setIsEditOpen(true);
    };

    // Open Confirmation Dialog
    const requestStop = (task) => {
        setConfirmConfig({ type: 'stop', task });
        setConfirmOpen(true);
    };

    const requestDelete = (task) => {
        setConfirmConfig({ type: 'delete', task });
        setConfirmOpen(true);
    };

    const executeConfirmAction = async () => {
        const { type, task } = confirmConfig;
        if (!type || !task) return;

        setConfirmOpen(false); // Close immediately or wait? Better close to show toast.

        try {
            if (type === 'stop') {
                await apiFetch(`/api/tasks/${task.id}/stop`, { method: "POST" });
                toast({ title: t(lang, "success"), description: t(lang, "taskStopped") || "Task stopped" });
            } else if (type === 'delete') {
                await apiFetch(`/api/tasks/${task.id}`, { method: "DELETE" });
                toast({ title: t(lang, "success"), description: t(lang, "taskDeleted") || "Task deleted" });
            }
            fetchTasks();
            if (onTaskUpdated) onTaskUpdated();
        } catch (e) {
            toast({ variant: "destructive", title: "Error", description: e.message });
        }
    };

    const handleSave = () => {
        setIsEditOpen(false);
        fetchTasks();
        toast({ title: t(lang, "saved"), description: t(lang, "taskSaved") || "Task saved successfully" });
        if (onTaskUpdated) onTaskUpdated();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>{t(lang, 'existingTasks')}</DialogTitle>
                </DialogHeader>

                <div className="mt-2 text-left">
                    <Button onClick={handleCreate} size="sm" className="gap-2">
                        <Plus size={16} /> {t(lang, 'create')}
                    </Button>
                </div>

                <div className="flex-1 overflow-y-auto mt-2">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[100px]">{t(lang, 'choosePeriodicity')}</TableHead>
                                <TableHead>{t(lang, 'description')}</TableHead>
                                <TableHead className="text-right">{t(lang, 'adminPanel')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {tasks.map(task => (
                                <TableRow key={task.id}>
                                    <TableCell>
                                        <Badge variant="secondary" className={`${PERIOD_COLORS[task.periodicity]} border-0`}>
                                            {t(lang, task.periodicity)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        {task.description}
                                        {task.active_until && (
                                            <div className="text-xs text-rose-500 mt-1">
                                                {t(lang, 'stop')}: {task.active_until}
                                            </div>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                            <Button variant="ghost" size="icon" onClick={() => handleEdit(task)} title={t(lang, 'edit')}>
                                                <Edit size={16} className="text-slate-500 hover:text-slate-700 dark:text-slate-400" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => requestStop(task)} title={t(lang, 'stop')}>
                                                <StopCircle size={16} className="text-amber-600 hover:text-amber-700" />
                                            </Button>
                                            <Button variant="ghost" size="icon" onClick={() => requestDelete(task)} title={t(lang, 'delete')}>
                                                <Trash2 size={16} className="text-rose-600 hover:text-rose-700" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>

                <EditTaskDialog
                    isOpen={isEditOpen}
                    onClose={() => setIsEditOpen(false)}
                    lang={lang}
                    task={editTask}
                    onSaved={handleSave}
                />

                {/* Confirmation Dialog */}
                <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                    <DialogContent className="sm:max-w-[400px]">
                        <DialogHeader>
                            <DialogTitle>
                                {confirmConfig.type === 'delete' ? t(lang, 'deleteConfirmTitle') : t(lang, 'confirm')}
                            </DialogTitle>
                        </DialogHeader>
                        <div className="py-4">
                            {confirmConfig.type === 'delete'
                                ? t(lang, 'hardDeleteWarning')
                                : t(lang, 'stopFuture')
                            }
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setConfirmOpen(false)}>{t(lang, 'cancel')}</Button>
                            <Button
                                variant={confirmConfig.type === 'delete' ? "destructive" : "default"}
                                onClick={executeConfirmAction}
                            >
                                {t(lang, 'confirm')}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </DialogContent>
        </Dialog>
    );
}
