import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea"; // Assuming we have or use Input for desc
import { t } from "@/lib/constants";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Users, Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { apiFetch } from "@/lib/api";
import { UserSelectionDialog } from "./UserSelectionDialog";

export function EditTaskDialog({ isOpen, onClose, lang, task = null, onSaved }) {
    const isEdit = !!task;

    const [periodicity, setPeriodicity] = useState("daily");
    const [description, setDescription] = useState("");
    const [procUrl, setProcUrl] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [activeUntil, setActiveUntil] = useState("");
    const [skipWeekends, setSkipWeekends] = useState(false);
    const [skipHolidays, setSkipHolidays] = useState(false);
    const [hnoGroup, setHnoGroup] = useState(""); // ID as string
    const [hnoEnabled, setHnoEnabled] = useState(false);
    const [hnoGroups, setHnoGroups] = useState([]);

    const [uploadMode, setUploadMode] = useState("url"); // 'url' or 'file'

    // Users & Groups
    const [users, setUsers] = useState([]);
    const [availableGroups, setAvailableGroups] = useState([]);
    const [assignedUsers, setAssignedUsers] = useState([]);

    // Assignment Mode: 'all', 'group', 'user'
    const [assignType, setAssignType] = useState('user');
    const [selectedGroups, setSelectedGroups] = useState([]); // Changed directly to array

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const fileInputRef = useRef(null);
    const [showUserDialog, setShowUserDialog] = useState(false);

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
            // Fetch Users
            apiFetch("/api/users").then(async r => {
                if (r.ok) {
                    const data = await r.json();
                    console.log('EditTaskDialog - Users received:', data);
                    if (Array.isArray(data)) setUsers(data);
                    else setUsers([]);
                }
            }).catch(usersErr => {
                console.error(usersErr);
                setUsers([]);
            });

            // Fetch Groups
            apiFetch("/api/roles").then(async r => {
                if (r.ok) {
                    const data = await r.json();
                    if (Array.isArray(data)) setAvailableGroups(data);
                    else setAvailableGroups([]);
                }
            }).catch(rolesErr => {
                console.error(rolesErr);
                setAvailableGroups([]);
            });

            // Fetch HNO status and groups
            apiFetch("/api/hno/status").then(r => r.json()).then(d => setHnoEnabled(d.enabled)).catch(() => setHnoEnabled(false));
            apiFetch("/api/hno/groups").then(r => r.json()).then(d => setHnoGroups(d || [])).catch(() => setHnoGroups([]));

            if (task) {
                setPeriodicity(task.periodicity || "daily");
                setDescription(task.description || "");
                setProcUrl(task.procedure_url || "");
                setStartDate(task.start_date || "");
                setEndDate(task.end_date || "");
                setActiveUntil(task.active_until || "");
                setActiveUntil(task.active_until || "");
                setSkipWeekends(!!task.skip_weekends);
                setSkipHolidays(!!task.skip_holidays);
                setHnoGroup(task.hno_group_id ? String(task.hno_group_id) : "");
                setUploadMode("url");

                // Assignment Init
                // We check assigned_groups first (new way), otherwise fallback to old assigned_group string
                if (task.assigned_groups && task.assigned_groups.length > 0) {
                    setAssignType('group');
                    setSelectedGroups(task.assigned_groups);
                    setAssignedUsers([]);
                } else if (task.assigned_group === 'all') {
                    setAssignType('user');
                    setSelectedGroups([]);
                    setAssignedUsers([]);
                } else if (task.assigned_group) {
                    // Legacy single group
                    setAssignType('group');
                    setSelectedGroups([task.assigned_group]);
                    setAssignedUsers([]);
                } else if (task.assigned_user_ids && task.assigned_user_ids.length > 0) {
                    setAssignType('user');
                    setAssignedUsers(task.assigned_user_ids.map(String));
                    setSelectedGroups([]);
                } else {
                    // Default fallback
                    setAssignType('user');
                    setAssignedUsers([]);
                    setSelectedGroups([]);
                }

            } else {
                // Default for new
                setPeriodicity("daily");
                setDescription("");
                setProcUrl("");
                setStartDate(new Date().toISOString().split('T')[0]);
                setEndDate("");
                setEndDate("");
                setActiveUntil("");
                setSkipWeekends(true);
                setSkipHolidays(true);
                setHnoGroup("");
                setUploadMode("url");

                // Default Assignment
                setAssignType('user');
                setAssignedUsers([]);
                setSelectedGroups([]);
            }
            setError("");
        }
    }, [isOpen, task]);

    // Safety log
    useEffect(() => {
        if (isOpen) console.log("EditTaskDialog Open. Task:", task);
    }, [isOpen, task]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        if (periodicity === 'hno' && !hnoGroup) {
            setError(t(lang, "hnoGroupRequired") || "HNO Group is required");
            setLoading(false);
            return;
        }

        try {
            // Determine final assignment values
            let finalAssignedUsers = null;
            let finalAssignedGroups = null; // We use new field for array

            if (assignType === 'group') {
                finalAssignedGroups = selectedGroups;
                finalAssignedUsers = null;
            } else if (assignType === 'user') {
                finalAssignedGroups = null;
                finalAssignedUsers = assignedUsers.length > 0 ? assignedUsers.map(id => parseInt(id)) : null;
            }

            const body = {
                periodicity,
                description,
                procedure_url: procUrl,
                start_date: startDate,
                end_date: endDate,
                active_until: activeUntil,
                skip_weekends: skipWeekends,
                skip_holidays: skipHolidays,
                hno_group_id: periodicity === 'hno' && hnoGroup ? parseInt(hnoGroup) : null,
                assigned_user_ids: finalAssignedUsers,
                assigned_groups: finalAssignedGroups,
                assigned_group: null // Clear legacy field effectively
            };

            let url = "/api/tasks";
            let method = "POST";

            if (isEdit) {
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
        <>
            <Dialog open={isOpen} onOpenChange={onClose}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle>
                            {isEdit ? t(lang, "editTaskTitle") : t(lang, "adminCreate")}
                        </DialogTitle>
                        <DialogDescription className="hidden">
                            {isEdit ? "Edit Task Details" : "Create New Task"}
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmit} className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="periodicity">{t(lang, "choosePeriodicity")}</Label>
                            <Select value={periodicity} onValueChange={setPeriodicity} disabled={isEdit}>
                                <SelectTrigger id="periodicity"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="daily">{t(lang, "daily")}</SelectItem>
                                    <SelectItem value="weekly">{t(lang, "weekly")}</SelectItem>
                                    <SelectItem value="monthly">{t(lang, "monthly")}</SelectItem>
                                    <SelectItem value="yearly">{t(lang, "yearly")}</SelectItem>
                                    {hnoEnabled && <SelectItem value="hno">{t(lang, "hnoTaskType")}</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>

                        {['daily', 'weekly', 'monthly', 'yearly', 'hno'].includes(periodicity) && (
                            <div className="grid grid-cols-2 gap-4">
                                {periodicity !== 'hno' && (
                                    <div className="flex items-center space-x-2">
                                        <Switch id="skip-weekends" checked={skipWeekends} onCheckedChange={setSkipWeekends} />
                                        <Label htmlFor="skip-weekends">{t(lang, "skipWeekends") || "Skip Weekends"}</Label>
                                    </div>
                                )}
                                <div className="flex items-center space-x-2">
                                    <Switch id="skip-holidays" checked={skipHolidays} onCheckedChange={setSkipHolidays} />
                                    <Label htmlFor="skip-holidays">{t(lang, "skipHolidays") || "Skip Holidays"}</Label>
                                </div>
                            </div>
                        )}

                        <div className="space-y-2">
                            <Label htmlFor="task-description">{t(lang, "description")}</Label>
                            <Input id="task-description" value={description} onChange={e => setDescription(e.target.value)} required autoComplete="off" />
                        </div>

                        <div className="space-y-2">
                            <Label>{t(lang, "assignTo")}</Label>
                            <div className="space-y-2">
                                {/* Type Selector */}
                                <Select value={assignType} onValueChange={setAssignType}>
                                    <SelectTrigger>
                                        <SelectValue placeholder={t(lang, "selectAssignmentType")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="group">{t(lang, "group")}</SelectItem>
                                        <SelectItem value="user">{t(lang, "user")}</SelectItem>
                                    </SelectContent>
                                </Select>

                                {/* Group Selector Multi */}
                                {assignType === 'group' && (
                                    <Popover>
                                        <PopoverTrigger asChild>
                                            <Button variant="outline" className="w-full justify-between font-normal">
                                                {selectedGroups.length > 0 ? (
                                                    <div className="flex gap-1 overflow-hidden">
                                                        {selectedGroups.slice(0, 3).map(g => (
                                                            <Badge key={g} variant="secondary" className="px-1 text-[10px]">{g}</Badge>
                                                        ))}
                                                        {selectedGroups.length > 3 && <span className="text-xs">+{selectedGroups.length - 3}</span>}
                                                    </div>
                                                ) : t(lang, "selectGroup")}
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[300px] p-0" align="start">
                                            <div className="p-1">
                                                {availableGroups.length === 0 && <p className="text-sm text-muted-foreground p-2 text-center">{t(lang, "noGroupAvailable")}</p>}
                                                {availableGroups.map((g) => {
                                                    const isSelected = selectedGroups.includes(g.name);
                                                    return (
                                                        <div
                                                            key={g.name}
                                                            className="flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground cursor-pointer transition-colors"
                                                            onClick={() => {
                                                                if (isSelected) {
                                                                    setSelectedGroups(selectedGroups.filter(x => x !== g.name));
                                                                } else {
                                                                    setSelectedGroups([...selectedGroups, g.name]);
                                                                }
                                                            }}
                                                        >
                                                            <div className={`flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible"}`}>
                                                                <Check className="h-3 w-3" />
                                                            </div>
                                                            <span className="flex-1">{g.name}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </PopoverContent>
                                    </Popover>
                                )}

                                {/* User Selector */}
                                {assignType === 'user' && (
                                    <div>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            className="w-full justify-start"
                                            onClick={() => setShowUserDialog(true)}
                                        >
                                            <Users className="mr-2 h-4 w-4" />
                                            {assignedUsers.length === 0
                                                ? t(lang, "unassigned")
                                                : `${assignedUsers.length} ${t(lang, "usersSelected")}`}
                                        </Button>
                                        {assignedUsers.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {assignedUsers.map(userId => {
                                                    const user = users.find(u => String(u.id) === userId);
                                                    return user ? (
                                                        <span
                                                            key={userId}
                                                            className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary"
                                                        >
                                                            {user.fullname || user.username}
                                                        </span>
                                                    ) : null;
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label>{t(lang, "procLink")}</Label>
                            <Tabs value={uploadMode} onValueChange={setUploadMode} className="w-full">
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="url">URL</TabsTrigger>
                                    <TabsTrigger value="file">{t(lang, "proc")}</TabsTrigger>
                                </TabsList>
                                <TabsContent value="url">
                                    <Input value={procUrl} onChange={e => setProcUrl(e.target.value)} placeholder="https://" autoComplete="url" />
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
                                            id="file-upload" // Added ID though hidden
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
                                <Label htmlFor="start-date">{t(lang, "startDate")}</Label>
                                <Input id="start-date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
                            </div>
                            {periodicity === 'yearly' && (
                                <div className="space-y-2">
                                    <Label htmlFor="end-date">{t(lang, "endDateYearly")}</Label>
                                    <Input id="end-date" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                                </div>
                            )}
                            {periodicity === 'hno' && (
                                <div className="space-y-2">
                                    <Label htmlFor="hno-group-select">{t(lang, "selectHNOGroup")}</Label>
                                    <Select value={hnoGroup} onValueChange={setHnoGroup}>
                                        <SelectTrigger id="hno-group-select"><SelectValue placeholder={t(lang, "selectHNOGroup")} /></SelectTrigger>
                                        <SelectContent>
                                            {hnoGroups.map(g => (
                                                <SelectItem key={g.id} value={String(g.id)}>{g.name} ({g.start_time}-{g.end_time})</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        {isEdit && (
                            <div className="space-y-2">
                                <Label htmlFor="active-until">{t(lang, "activeUntilLabel")}</Label>
                                <Input id="active-until" type="date" value={activeUntil} onChange={e => setActiveUntil(e.target.value)} />
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

            <UserSelectionDialog
                isOpen={showUserDialog}
                onClose={() => setShowUserDialog(false)}
                lang={lang}
                users={users}
                selectedUserIds={assignedUsers}
                onSave={(selected) => setAssignedUsers(selected)}
            />
        </>
    );
}
