import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EditTaskDialog } from "./EditTaskDialog";
import { DelegationDialog } from "./DelegationDialog";
import { HNOSettingsDialog } from "./HNOSettingsDialog";
import { ScheduleSettingsDialog } from "./ScheduleSettingsDialog";
import { apiFetch } from "@/lib/api";
import { t, PERIOD_COLORS } from "@/lib/constants";
import { Edit, StopCircle, Trash2, Plus, Users, User, UserCog, Search, ArrowUpDown, Calendar, Settings, Clock } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function AdminTasksDialog({ isOpen, onClose, lang, onTaskUpdated, onConfigUpdate }) {
    // State for filters and data
    const [tasks, setTasks] = useState([]);
    const [users, setUsers] = useState([]);
    const [groups, setGroups] = useState([]);
    const [config, setConfig] = useState(null);
    const [hnoGroups, setHnoGroups] = useState([]);

    const [loading, setLoading] = useState(false);
    const [editTask, setEditTask] = useState(null); // Task to edit
    const [isEditOpen, setIsEditOpen] = useState(false); // Controls EditTaskDialog

    // Filters
    const [search, setSearch] = useState("");
    const [filterPeriod, setFilterPeriod] = useState("all");
    const [filterGroup, setFilterGroup] = useState("all");
    const [filterUser, setFilterUser] = useState("all");
    const [sortBy, setSortBy] = useState("periodicity"); // periodicity, user, group

    // Delegation State
    const [delegationTask, setDelegationTask] = useState(null);
    const [isDelegationOpen, setIsDelegationOpen] = useState(false);
    const [isHnoSettingsOpen, setIsHnoSettingsOpen] = useState(false);
    const [isScheduleSettingsOpen, setIsScheduleSettingsOpen] = useState(false);

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
            apiFetch("/api/users").then(r => r.json()).then(setUsers).catch(console.error);
            apiFetch("/api/roles").then(r => r.json()).then(setGroups).catch(console.error);
            apiFetch("/api/config").then(r => r.json()).then(setConfig).catch(console.error);
            apiFetch("/api/hno/groups").then(r => r.json()).then(setHnoGroups).catch(console.error);
        }
    }, [isOpen]);

    const filteredTasks = React.useMemo(() => {
        return tasks.filter(task => {
            // Search
            if (search) {
                const s = search.toLowerCase();
                const inDesc = task.description.toLowerCase().includes(s);

                // Groups
                const taskGroups = task.assigned_groups || (task.assigned_group ? [task.assigned_group] : []);
                const inGroup = taskGroups.some(g => g.toLowerCase().includes(s));

                // Users
                const uIds = task.assigned_user_ids || (task.assigned_user_id ? [task.assigned_user_id] : []);
                const inUser = uIds.some(uid => {
                    const u = users.find(user => user.id === Number(uid));
                    if (!u) return false;
                    return (u.username && u.username.toLowerCase().includes(s)) ||
                        (u.fullname && u.fullname.toLowerCase().includes(s));
                });

                if (!inDesc && !inGroup && !inUser) return false;
            }
            // Periodicity
            if (filterPeriod !== 'all' && task.periodicity !== filterPeriod) return false;
            // Group
            if (filterGroup !== 'all') {
                const g = task.assigned_groups || (task.assigned_group ? [task.assigned_group] : []);
                if (!g.includes(filterGroup)) return false;
            }
            // User
            if (filterUser !== 'all') {
                const uIds = task.assigned_user_ids || (task.assigned_user_id ? [task.assigned_user_id] : []);
                if (!uIds.includes(Number(filterUser))) return false;
            }
            return true;
        }).sort((a, b) => {
            if (sortBy === 'periodicity') {
                const pOrder = { daily: 1, weekly: 2, monthly: 3, yearly: 4 };
                const pa = pOrder[a.periodicity] || 99;
                const pb = pOrder[b.periodicity] || 99;
                return pa - pb;
            } else if (sortBy === 'user') {
                // Sort by first assigned user ID? Or name?
                const uA = (a.assigned_user_ids && a.assigned_user_ids[0]) || 999999;
                const uB = (b.assigned_user_ids && b.assigned_user_ids[0]) || 999999;
                return uA - uB;
            } else if (sortBy === 'group') {
                const gA = (a.assigned_groups && a.assigned_groups[0]) || a.assigned_group || "zzzz";
                const gB = (b.assigned_groups && b.assigned_groups[0]) || b.assigned_group || "zzzz";
                return gA.localeCompare(gB);
            }
            return 0;
        });
    }, [tasks, search, filterPeriod, filterGroup, filterUser, sortBy]);

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

    const getTaskTimeDisplay = (task) => {
        if (!config) return "...";

        if (task.periodicity === 'hno') {
            const g = hnoGroups.find(g => g.id === task.hno_group_id);
            if (g) return `${g.start_time} - ${g.end_time}`;
            return "-";
        }

        const sched = config.sys_schedule || {};
        const mode = sched.mode || 'global';
        const defStart = "08:00";
        const defEnd = "19:00";

        let s, e;
        if (mode === 'global') {
            s = sched.global?.start || defStart;
            e = sched.global?.end || defEnd;
        } else {
            const p = sched[task.periodicity] || {};
            s = p.start || defStart;
            e = p.end || defEnd;
        }
        return `${s} - ${e}`;
    };

    const getHnoEndDate = (task) => {
        if (task.active_until) return task.active_until;

        const g = hnoGroups.find(g => g.id === task.hno_group_id);
        if (!g || !g.days) return task.start_date;

        const dayInts = g.days.split(',').map(d => parseInt(d)).map(d => d === 0 ? 7 : d);
        if (dayInts.length === 0) return task.start_date;

        const minD = Math.min(...dayInts);
        const maxD = Math.max(...dayInts);
        const diff = maxD - minD;

        if (diff <= 0) return task.start_date;

        const [y, m, d] = task.start_date.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + diff);

        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const getHnoDayNames = (task) => {
        const g = hnoGroups.find(g => g.id === task.hno_group_id);
        if (!g || !g.days) return { start: "-", end: "-" };

        const days = g.days.split(',').map(Number);
        // Sort: 1 (Mon) .. 6 (Sat), 0 (Sun). We treat 0 as 7 for sorting to get Mon->Sun order.
        days.sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b));

        const map = {
            1: 'dayMon', 2: 'dayTue', 3: 'dayWed', 4: 'dayThu', 5: 'dayFri', 6: 'daySat', 0: 'daySun'
        };

        return {
            start: t(lang, map[days[0]]) || "-",
            end: t(lang, map[days[days.length - 1]]) || "-"
        };
    };

    const formatDate = (dateStr, type, lang) => {
        if (!dateStr) return "-";
        const [y, m, d] = dateStr.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const locale = lang === 'en' ? 'en-US' : 'fr-FR';

        if (type === 'yearly') {
            return date.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
        }
        if (type === 'hno') {
            return date.toLocaleDateString(locale, { weekday: 'long' });
        }
        return dateStr;
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[900px] max-h-[85vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{t(lang, 'existingTasks')}</DialogTitle>
                        <DialogDescription className="hidden">Admin Tasks Management</DialogDescription>
                    </DialogHeader>

                    <div className="mt-2 text-left flex flex-col gap-3">
                        <div className="flex gap-2">
                            <Button onClick={handleCreate} size="sm" className="gap-2 w-fit">
                                <Plus size={16} /> {t(lang, 'create')}
                            </Button>

                            <Button onClick={() => setIsScheduleSettingsOpen(true)} size="sm" variant="outline" className="gap-2 w-fit px-3" title={t(lang, 'scheduleSettingsTitle')}>
                                <Settings size={16} />
                            </Button>
                        </div>

                        {/* Filters Bar */}
                        <div className="flex flex-wrap items-center gap-3 bg-slate-50 dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                            {/* Search */}
                            <div className="relative w-[200px]">
                                <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    placeholder={t(lang, 'searchPlaceholder')}
                                    className="pl-8 h-9"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                            </div>

                            {/* Periodicity Filter */}
                            <Select value={filterPeriod} onValueChange={setFilterPeriod}>
                                <SelectTrigger className="w-[130px] h-9">
                                    <Calendar className="w-3 h-3 mr-2" />
                                    <SelectValue placeholder={t(lang, 'choosePeriodicity')} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                    <SelectItem value="daily">{t(lang, 'daily')}</SelectItem>
                                    <SelectItem value="weekly">{t(lang, 'weekly')}</SelectItem>
                                    <SelectItem value="monthly">{t(lang, 'monthly')}</SelectItem>
                                    <SelectItem value="yearly">{t(lang, 'yearly')}</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Group Filter */}
                            <Select value={filterGroup} onValueChange={setFilterGroup}>
                                <SelectTrigger className="w-[130px] h-9">
                                    <Users className="w-3 h-3 mr-2" />
                                    <SelectValue placeholder={t(lang, 'group') || "Group"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                    {groups.map((g, i) => (
                                        <SelectItem key={i} value={g.name}>{g.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* User Filter */}
                            <Select value={filterUser} onValueChange={setFilterUser}>
                                <SelectTrigger className="w-[130px] h-9">
                                    <User className="w-3 h-3 mr-2" />
                                    <SelectValue placeholder={t(lang, 'user') || "User"} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{t(lang, 'all')}</SelectItem>
                                    {users.map(u => (
                                        <SelectItem key={u.id} value={String(u.id)}>{u.fullname || u.username}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {/* Sort */}
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-[130px] h-9">
                                    <ArrowUpDown className="w-3 h-3 mr-2" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="periodicity">{t(lang, 'choosePeriodicity')}</SelectItem>
                                    <SelectItem value="user">{t(lang, 'user') || "User"}</SelectItem>
                                    <SelectItem value="group">{t(lang, 'group') || "Group"}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto mt-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[100px]">{t(lang, 'choosePeriodicity')}</TableHead>
                                    <TableHead>{t(lang, 'description')}</TableHead>
                                    <TableHead>{t(lang, 'schedule') || "Horaire"}</TableHead>
                                    <TableHead>{t(lang, 'assignedTo') || "Attribué à"}</TableHead>
                                    <TableHead>{t(lang, 'delegation') || "Délégation"}</TableHead>
                                    <TableHead className="text-right">{t(lang, 'adminPanel')}</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {filteredTasks.map(task => (
                                    <TableRow key={task.id}>
                                        <TableCell>
                                            <Badge variant="secondary" className={`${PERIOD_COLORS[task.periodicity]} border-0`}>
                                                {t(lang, task.periodicity)}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-medium" title={task.description}>
                                                {task.description.length > 13 ? task.description.substring(0, 13) + '...' : task.description}
                                            </div>
                                            {task.active_until && (
                                                <div className="text-xs text-rose-500 mt-1">
                                                    {t(lang, 'stop')}: {task.active_until}
                                                </div>
                                            )}
                                        </TableCell>
                                        <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-400">
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <Button variant="ghost" className="h-7 px-2.5 font-normal text-sm hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all flex items-center gap-2 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 group">
                                                        <Clock size={13} className="text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300 transition-colors" />
                                                        <span className="group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">{getTaskTimeDisplay(task)}</span>
                                                    </Button>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-3">
                                                    <div className="text-sm space-y-3">
                                                        <div className="font-semibold border-b pb-1 mb-1">{t(lang, 'scheduleDetails')}</div>

                                                        {/* Recurrence Section */}
                                                        <div>
                                                            <div className="text-xs text-slate-500 mb-1 font-medium">{t(lang, 'recurrence')}</div>
                                                            {task.periodicity === 'daily' && <div>{t(lang, 'everyDay')}</div>}
                                                            {task.periodicity === 'weekly' && <div>{t(lang, 'everyWeek')}</div>}
                                                            {task.periodicity === 'monthly' && <div>{t(lang, 'everyMonth')}</div>}

                                                            {['yearly', 'hno'].includes(task.periodicity) && (
                                                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                                                                    {task.periodicity === 'hno' ? (
                                                                        (() => {
                                                                            const { start, end } = getHnoDayNames(task);
                                                                            return (
                                                                                <>
                                                                                    <span className="text-slate-500">{t(lang, 'taskStart')}:</span>
                                                                                    <span className="capitalize">{start}</span>
                                                                                    <span className="text-slate-500">{t(lang, 'taskEnd')}:</span>
                                                                                    <span className="capitalize">{end}</span>
                                                                                </>
                                                                            );
                                                                        })()
                                                                    ) : (
                                                                        <>
                                                                            <span className="text-slate-500">{t(lang, 'taskStart')}:</span>
                                                                            <span className="capitalize">{formatDate(task.start_date, task.periodicity, lang)}</span>

                                                                            {task.periodicity === 'yearly' && (
                                                                                <>
                                                                                    <span className="text-slate-500">{t(lang, 'taskEnd')}:</span>
                                                                                    <span className="capitalize">{formatDate(task.end_date, task.periodicity, lang)}</span>
                                                                                </>
                                                                            )}
                                                                        </>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Exceptions Section */}
                                                        <div>
                                                            <div className="text-xs text-slate-500 mb-1 font-medium">{t(lang, 'exceptions')}</div>
                                                            <div className="flex flex-col gap-1">
                                                                <div className={`flex items-center gap-2 ${task.skip_weekends ? "text-rose-600" : "text-emerald-600"}`}>
                                                                    {task.skip_weekends ? <StopCircle size={14} /> : <Calendar size={14} />}
                                                                    {task.skip_weekends ? t(lang, 'weekendsExcluded') : t(lang, 'weekendsIncluded')}
                                                                </div>
                                                                <div className={`flex items-center gap-2 ${task.skip_holidays ? "text-rose-600" : "text-emerald-600"}`}>
                                                                    {task.skip_holidays ? <StopCircle size={14} /> : <Calendar size={14} />}
                                                                    {task.skip_holidays ? t(lang, 'holidaysExcluded') : t(lang, 'holidaysIncluded')}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </PopoverContent>
                                            </Popover>
                                        </TableCell>
                                        <TableCell>
                                            {(() => {
                                                if (task.assigned_groups && task.assigned_groups.length > 0) {
                                                    return (
                                                        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                                                            <Users size={14} className="opacity-70" />
                                                            {task.assigned_groups.length === 1 ? task.assigned_groups[0] : (t(lang, 'multipleGroups') || "Multiple Groups")}
                                                        </div>
                                                    );
                                                }
                                                if (task.assigned_group) {
                                                    return (
                                                        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                                                            <Users size={14} className="opacity-70" />
                                                            {task.assigned_group === 'all' ? (t(lang, 'everyone') || 'Everyone') : task.assigned_group}
                                                        </div>
                                                    );
                                                }
                                                if (task.assigned_user_ids && task.assigned_user_ids.length > 0) {
                                                    const names = task.assigned_usernames || task.assigned_user_ids.map(id => `User ${id}`);
                                                    const label = names.length === 1 ? names[0] : `${names.length} ${t(lang, 'multipleUsers') || 'users'}`;

                                                    return (
                                                        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400" title={names.join(', ')}>
                                                            {task.assigned_user_ids.length === 1 ? <User size={14} className="opacity-70" /> : <Users size={14} className="opacity-70" />}
                                                            {label}
                                                        </div>
                                                    );
                                                }
                                                return <span className="text-slate-400 text-xs">-</span>;
                                            })()}
                                        </TableCell>
                                        <TableCell>
                                            {task.active_delegation ? (
                                                <div className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-200">
                                                    <UserCog size={12} />
                                                    {task.active_delegation.delegate_username}
                                                </div>
                                            ) : (
                                                <span className="text-slate-400 text-xs">-</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1">
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleEdit(task)} title={t(lang, 'edit')}>
                                                    <Edit size={14} className="text-slate-500 hover:text-slate-700 dark:text-slate-400" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => {
                                                    setDelegationTask(task);
                                                    setIsDelegationOpen(true);
                                                }} title={t(lang, 'delegation') || "Delegation"}>
                                                    <UserCog size={14} className="text-indigo-600 hover:text-indigo-700" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => requestStop(task)} title={t(lang, 'stop')}>
                                                    <StopCircle size={14} className="text-amber-600 hover:text-amber-700" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => requestDelete(task)} title={t(lang, 'delete')}>
                                                    <Trash2 size={14} className="text-rose-600 hover:text-rose-700" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                </DialogContent>
            </Dialog>

            <EditTaskDialog
                isOpen={isEditOpen}
                onClose={() => setIsEditOpen(false)}
                lang={lang}
                task={editTask}
                onSaved={handleSave}
            />

            <DelegationDialog
                isOpen={isDelegationOpen}
                onClose={() => setIsDelegationOpen(false)}
                lang={lang}
                task={delegationTask}
            />

            <HNOSettingsDialog
                isOpen={isHnoSettingsOpen}
                onClose={() => setIsHnoSettingsOpen(false)}
                lang={lang}
            />

            <ScheduleSettingsDialog
                isOpen={isScheduleSettingsOpen}
                onClose={() => setIsScheduleSettingsOpen(false)}
                lang={lang}
                onManageHno={() => setIsHnoSettingsOpen(true)}
                onConfigUpdate={onConfigUpdate}
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
        </>
    );
}
