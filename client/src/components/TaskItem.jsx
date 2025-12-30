import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusChip } from "./StatusChip";
import { t, PERIOD_COLORS } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { ExternalLink, Check, X, Edit, Lock, Calendar, Clock, User, Users, UserCog } from 'lucide-react';
import { DelegationDialog } from "./DelegationDialog";

// Status-based card styling configuration
const statusCardStyles = {
    pending: {
        border: "border-l-4 border-l-amber-500 dark:border-l-amber-400",
        gradient: "bg-gradient-to-r from-amber-50/40 via-transparent to-transparent dark:from-amber-950/20"
    },
    validated: {
        border: "border-l-4 border-l-emerald-500 dark:border-l-emerald-400",
        gradient: "bg-gradient-to-r from-emerald-50/40 via-transparent to-transparent dark:from-emerald-950/20"
    },
    failed: {
        border: "border-l-4 border-l-rose-500 dark:border-l-rose-400",
        gradient: "bg-gradient-to-r from-rose-50/40 via-transparent to-transparent dark:from-rose-950/20"
    },
    missing: {
        border: "border-l-4 border-l-slate-400 dark:border-l-slate-500",
        gradient: "bg-gradient-to-r from-slate-50/40 via-transparent to-transparent dark:from-slate-900/20"
    },
    ferie: {
        border: "border-l-4 border-l-sky-500 dark:border-l-sky-400",
        gradient: "bg-gradient-to-r from-sky-50/40 via-transparent to-transparent dark:from-sky-950/20"
    }
};

export function TaskItem({ lang = "EN", it, onValidate, onSetStatus, onEdit, isAdmin, isUser, timeZone, currentUser }) {
    // Permission Check
    let canAct = isAdmin;

    if (!isAdmin && isUser && currentUser) {
        const myId = Number(currentUser.id);
        const myGroups = currentUser.groups || [];

        const assignedIds = (it.assigned_user_ids || []).map(Number);
        if (it.assigned_user_id) assignedIds.push(Number(it.assigned_user_id));

        const assignedGroups = [...(it.assigned_groups || [])];
        if (it.assigned_group && it.assigned_group !== 'all' && !assignedGroups.includes(it.assigned_group)) {
            assignedGroups.push(it.assigned_group);
        }

        const isUnassigned = assignedIds.length === 0 && assignedGroups.length === 0;
        const isAssignedUser = assignedIds.includes(myId);
        const isAssignedGroup = assignedGroups.some(g => myGroups.includes(g));

        if (isUnassigned || isAssignedUser || isAssignedGroup) {
            canAct = true;
        }
    } else if (!isAdmin && isUser) {
        // Fallback if currentUser not passed but isUser is true (legacy/standalone check)
        // Actually, if we want to hide buttons, we should default to false if we don't know the user.
        // But for backward compatibility if I miss updating the parent, maybe default true?
        // User requested STRICT hiding. So default false if missing info.
        // But in standalone mode (no team), maybe everyone is same?
        // `isUser` implies Team Mode usually? Or at least logged in.
        // If app_mode != team, usually no login?
        // Let's assume if currentUser is passed, use it. If not, maybe allow?
        // User says "si un user ne fait pas parti...". Implies Team Mode.
        canAct = false; // Strict security: If user info missing, deny.
    }

    // Refine: if currentUser provided, enforce it.
    if (currentUser && !isAdmin && isUser) {
        const myId = Number(currentUser.id);
        const myGroups = currentUser.groups || [];
        const assignedIds = (it.assigned_user_ids || []).map(Number);
        if (it.assigned_user_id) assignedIds.push(Number(it.assigned_user_id));

        const assignedGroups = [...(it.assigned_groups || [])];
        if (it.assigned_group && it.assigned_group !== 'all' && !assignedGroups.includes(it.assigned_group)) {
            assignedGroups.push(it.assigned_group);
        }

        const isUnassigned = assignedIds.length === 0 && assignedGroups.length === 0;
        const isAssignedUser = assignedIds.includes(myId);
        const isAssignedGroup = assignedGroups.some(g => myGroups.includes(g));

        canAct = isUnassigned || isAssignedUser || isAssignedGroup;
    }

    const periodCls = PERIOD_COLORS[it.periodicity] || "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [isDelegationOpen, setIsDelegationOpen] = useState(false);
    const [isDelegationConfirmOpen, setIsDelegationConfirmOpen] = useState(false);

    const setAndClose = (st) => {
        setIsEditDialogOpen(false);
        onSetStatus(it, st);
    };

    return (
        <Card className="mb-4 overflow-hidden rounded-xl border bg-card text-card-foreground shadow transition-all hover:shadow-md">
            <div className="flex items-stretch">
                {/* LEFT SIDE: Header + Content (Flex-1 to take available space) */}
                <div className="flex-1 flex items-stretch p-5 min-w-0">

                    {/* COL 1: Meta (Periodicity + Actions) */}
                    <div className="w-[8.5rem] flex flex-col gap-4 shrink-0 justify-center">
                        {/* Periodicity Badge */}
                        <div>
                            <Badge
                                variant="secondary"
                                className={`w-full justify-center px-0 py-2 text-xs font-bold uppercase tracking-wider rounded-md border-0 ${periodCls}`}
                            >
                                {t(lang, it.periodicity)}
                            </Badge>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col items-center gap-2 w-full">
                            {!isAdmin && canAct && it.status === 'pending' && (
                                <div className="inline-flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-950 shadow-md w-full justify-center">
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 flex-1 px-0 rounded-none text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all"
                                        onClick={() => onValidate(it)}
                                        title={t(lang, 'validate')}
                                    >
                                        <Check size={18} strokeWidth={2.5} />
                                    </Button>
                                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600" />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 flex-1 px-0 rounded-none text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                                        onClick={() => onSetStatus(it, 'failed')}
                                        title={t(lang, 'fail')}
                                    >
                                        <X size={18} strokeWidth={2.5} />
                                    </Button>
                                </div>
                            )}

                            {isAdmin && (
                                <div className="inline-flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-950 shadow-md w-full justify-center">
                                    <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="sm" className="h-9 flex-1 px-0 rounded-none text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all font-medium" title={t(lang, 'status')}>
                                                <Edit size={16} />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="sm:max-w-[425px]">
                                            <DialogHeader>
                                                <DialogTitle>{t(lang, 'editTaskTitle')}</DialogTitle>
                                            </DialogHeader>
                                            <div className="grid gap-3 py-3">
                                                <Button
                                                    variant="outline"
                                                    className="justify-start h-12 bg-gradient-to-r from-amber-100 to-amber-50 text-amber-900 hover:from-amber-200 hover:to-amber-100 border-amber-300 dark:from-amber-900/40 dark:to-amber-900/20 dark:text-amber-100 dark:border-amber-700 font-semibold shadow-sm"
                                                    onClick={() => setAndClose('pending')}
                                                >
                                                    <Clock className="mr-2 h-5 w-5" />
                                                    {t(lang, 'pending')}
                                                </Button>
                                                <Button
                                                    className="justify-start h-12 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-semibold shadow-md"
                                                    onClick={() => setAndClose('validated')}
                                                >
                                                    <Check className="mr-2 h-5 w-5" />
                                                    {t(lang, 'validated')}
                                                </Button>
                                                <Button
                                                    variant="destructive"
                                                    className="justify-start h-12 bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-700 hover:to-rose-600 font-semibold shadow-md"
                                                    onClick={() => setAndClose('failed')}
                                                >
                                                    <X className="mr-2 h-5 w-5" />
                                                    {t(lang, 'failed')}
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    className="justify-start h-12 bg-gradient-to-r from-slate-200 to-slate-100 text-slate-900 hover:from-slate-300 hover:to-slate-200 dark:from-slate-800 dark:to-slate-900 dark:text-slate-100 font-semibold shadow-sm"
                                                    onClick={() => setAndClose('missing')}
                                                >
                                                    <Lock className="mr-2 h-5 w-5" />
                                                    {t(lang, 'missing')}
                                                </Button>
                                            </div>
                                        </DialogContent>
                                    </Dialog>
                                    <div className="w-px h-5 bg-slate-300 dark:bg-slate-600" />
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-9 flex-1 px-0 rounded-none text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                        onClick={() => setIsDelegationConfirmOpen(true)}
                                        title={t(lang, 'delegation') || "Delegation"}
                                    >
                                        <UserCog size={16} />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SEPARATOR */}
                    <div className="w-px bg-slate-200 dark:bg-slate-700 mx-5 h-[80%] my-auto" />

                    {/* COL 2: Content (Details + Title) - SWAPPED ORDER */}
                    <div className="flex-1 flex flex-col gap-3 min-w-0">
                        {/* Details (Now First) */}
                        <div className="min-w-0 space-y-3">
                            <div className="flex items-center gap-3 flex-wrap w-full">
                                <div className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/40 px-3 py-2 rounded-md border border-slate-200 dark:border-slate-800">
                                    <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                                    <div className="font-mono">
                                        <span className="font-semibold text-slate-700 dark:text-slate-300">{t(lang, 'from')}</span> <span className="text-slate-900 dark:text-slate-100 font-bold">
                                            {(() => {
                                                try {
                                                    const d = it.start_ts ? new Date(it.start_ts) : (it.start_date ? new Date(it.start_date) : null);
                                                    if (!d) return "";
                                                    return new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'en-GB', {
                                                        timeZone: timeZone || "UTC",
                                                        dateStyle: 'long',
                                                        timeStyle: 'short'
                                                    }).format(d).replace(" at ", " ").replace(" à ", " ");
                                                } catch { return fmt(it.start_ts || it.start_date, timeZone); }
                                            })()}
                                        </span>
                                        {(it.end_ts || it.end_date) && (
                                            <>
                                                {" "}<span className="font-semibold text-slate-700 dark:text-slate-300">{t(lang, 'to')}</span>{" "}
                                                <span className="text-slate-900 dark:text-slate-100 font-bold">
                                                    {(() => {
                                                        try {
                                                            const d = it.end_ts ? new Date(it.end_ts) : (it.end_date ? new Date(it.end_date) : null);
                                                            if (!d) return "";
                                                            return new Intl.DateTimeFormat(lang === 'FR' ? 'fr-FR' : 'en-GB', {
                                                                timeZone: timeZone || "UTC",
                                                                dateStyle: 'long',
                                                                timeStyle: 'short'
                                                            }).format(d).replace(" at ", " ").replace(" à ", " ");
                                                        } catch { return fmt(it.end_ts || it.end_date, timeZone); }
                                                    })()}
                                                </span>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {it.procedure_url && (
                                    <a
                                        href={it.procedure_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-block"
                                    >
                                        <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105 cursor-pointer px-3 py-1.5">
                                            <ExternalLink size={14} className="mr-1.5" strokeWidth={2.5} />
                                            <span className="font-semibold">{t(lang, 'proc')}</span>
                                        </Badge>
                                    </a>
                                )}

                                {/* Display who validated or failed */}
                                {it.updated_by_username && (it.status === 'validated' || it.status === 'failed') && (
                                    <div className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700">
                                        <User className="w-3.5 h-3.5 opacity-70" />
                                        <span className="font-medium">
                                            {it.status === 'validated' ? t(lang, 'validatedBy') : t(lang, 'failedBy')}
                                        </span>
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                                            {it.updated_by_username}
                                        </span>
                                    </div>
                                )}





                                {it.status === 'ferie' && (
                                    <div className="text-sm text-sky-800 dark:text-sky-200 bg-sky-50 dark:bg-sky-900/30 px-4 py-3 rounded-lg border border-sky-200 dark:border-sky-800 shadow-sm">
                                        <Calendar className="w-4 h-4 inline mr-2" />
                                        {t(lang, 'ferieNote')}
                                    </div>
                                )}
                            </div>

                            {/* Task Title (Now Second) */}
                            <div className="flex-1 flex items-center">
                                <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-2 bg-slate-50/50 dark:bg-slate-900/20 w-full flex items-center min-h-[40px]">
                                    <h3 className="font-semibold text-sm leading-snug tracking-tight text-foreground break-words w-full">
                                        {it.description}
                                    </h3>
                                </div>
                            </div>

                            {/* Failure Comment (Moved to bottom) */}
                            {it.status === 'failed' && it.comment && (
                                <div className="text-xs bg-destructive/10 text-destructive dark:bg-red-500 dark:text-white px-3 py-1.5 rounded-md mt-2 shadow-sm font-medium">
                                    <span className="uppercase opacity-90 text-[10px] mr-1">{t(lang, 'comment')}</span> {it.comment}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* SEPARATOR 2 */}
                    <div className="w-px bg-slate-200 dark:bg-slate-700 h-[80%] my-auto ml-5" />

                    {/* RIGHT SIDE: Status Badge + Assignment (Vertical Stack) */}
                    <div className="flex flex-col items-center justify-center px-5 gap-3 min-w-[140px]">
                        <StatusChip lang={lang} status={it.status} />

                        {/* Assignment Badge */}
                        {(() => {
                            let label = "";
                            let fullList = [];
                            let Icon = Check; // Default fallback

                            // 1. New Groups Array
                            if (it.assigned_groups && it.assigned_groups.length > 0) {
                                fullList = it.assigned_groups;
                                if (fullList.length === 1) {
                                    label = fullList[0];
                                    Icon = Users;
                                } else {
                                    label = t(lang, 'multipleGroups') || "Multiple Groups";
                                    Icon = Users;
                                }
                            }
                            // 2. Legacy Group
                            else if (it.assigned_group) {
                                if (it.assigned_group === 'all') {
                                    label = t(lang, 'everyone') || "Everyone";
                                    Icon = Users;
                                } else {
                                    label = it.assigned_group;
                                    Icon = Users;
                                }
                                fullList = [label];
                            }
                            // 3. User Assignments
                            else if (it.assigned_user_ids && it.assigned_user_ids.length > 0) {
                                // Prefer fullnames, fallback to usernames if available 
                                let names = [];
                                if (it.assigned_fullnames && Array.isArray(it.assigned_fullnames)) {
                                    // Use fullnames, filter out empty ones
                                    names = it.assigned_fullnames.map((fn, idx) => fn || (it.assigned_usernames && it.assigned_usernames[idx]) || `User ${it.assigned_user_ids[idx]}`);
                                } else if (it.assigned_usernames && Array.isArray(it.assigned_usernames)) {
                                    names = it.assigned_usernames;
                                } else {
                                    names = it.assigned_user_ids.map(id => `User ${id}`);
                                }

                                fullList = names;

                                if (fullList.length === 1) {
                                    label = fullList[0];
                                    Icon = User;
                                } else {
                                    label = `${fullList.length} ${t(lang, 'users') || 'Users'}`;
                                    Icon = Users;
                                }
                            } else {
                                // No assignment info found -> Everyone
                                label = t(lang, 'everyone') || "Everyone";
                                Icon = Users;
                                fullList = [label];
                            }

                            return (
                                <div className="relative group/tooltip inline-block">
                                    <Badge variant="outline" className="bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-800 cursor-default flex items-center gap-1.5 px-2.5 py-1">
                                        <Icon size={14} className="opacity-70" strokeWidth={2} />
                                        <span className="truncate max-w-[120px] inline-block font-medium">{label}</span>
                                    </Badge>

                                    {/* Tooltip */}
                                    {(fullList.length > 1 || (fullList.length === 1 && fullList[0] !== label)) && (
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block z-50">
                                            <div className="bg-slate-800 text-white text-xs rounded py-1.5 px-3 shadow-lg whitespace-nowrap">
                                                {fullList.join(', ')}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-800"></div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>
            </div>
            {/* Delegation Confirmation */}
            <Dialog open={isDelegationConfirmOpen} onOpenChange={setIsDelegationConfirmOpen}>
                <DialogContent className="sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>{t(lang, 'confirm')}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        {t(lang, 'confirmDelegationEdit') || "Modify delegation for this specific day?"}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDelegationConfirmOpen(false)}>
                            {t(lang, 'cancel')}
                        </Button>
                        <Button onClick={() => {
                            setIsDelegationConfirmOpen(false);
                            setIsDelegationOpen(true);
                        }}>
                            {t(lang, 'confirm')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            <DelegationDialog
                isOpen={isDelegationOpen}
                onClose={() => setIsDelegationOpen(false)}
                lang={lang}
                task={{ id: it.task_id || it.id }} // Prefer task_id if instance, else id
                fixedDate={it.start_ts ? new Date(it.start_ts).toISOString().split('T')[0] : (it.start_date || new Date().toISOString().split('T')[0])}
            />
        </Card>
    );
}
