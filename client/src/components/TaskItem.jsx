import React, { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { StatusChip } from "./StatusChip";
import { t, PERIOD_COLORS } from "@/lib/constants";
import { fmt } from "@/lib/utils";
import { ExternalLink, Check, X, Edit, Lock, Calendar, Clock } from 'lucide-react';

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

export function TaskItem({ lang = "EN", it, onValidate, onSetStatus, onEdit, isAdmin, isUser, timeZone }) {
    const canAct = isAdmin || isUser;
    const periodCls = PERIOD_COLORS[it.periodicity] || "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200";
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

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
                                            <Button variant="ghost" size="sm" className="h-9 w-full rounded-none text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 transition-all font-medium" title={t(lang, 'status')}>
                                                <Edit size={16} className="mr-2" />
                                                {t(lang, 'status')}
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
                            </div>



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
                <div className="w-px bg-slate-200 dark:bg-slate-700 h-[80%] my-auto" />

                {/* RIGHT SIDE: Status Badge (Centered Vertically) */}
                <div className="flex items-center px-5">
                    <StatusChip lang={lang} status={it.status} />
                </div>
            </div>
        </Card>
    );
}
