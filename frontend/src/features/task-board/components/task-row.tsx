import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, ExternalLink, Users, Building2, FileText, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BoardItem, TaskStatusValue } from '@/api/types';
import { useAuthStore } from '@/stores/auth-store';
import { tasksApi } from "@/api/tasks";
import { useMutation } from "@tanstack/react-query";
import { FailTaskDialog } from '@/features/tasks/components/fail-task-dialog';
import { format, parseISO, isPast, isBefore, subHours, isSameDay } from 'date-fns';
import { fr } from 'date-fns/locale';

interface TaskRowProps {
    item: BoardItem;
    onStatusChange: (data: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) => void;
    onAdminAction?: (item: BoardItem) => void;
    readonly?: boolean;
}

const PERIODICITY_STYLES: Record<string, string> = {
    daily: 'text-indigo-400 bg-indigo-500/20 border-indigo-400/30',
    weekly: 'text-violet-400 bg-violet-500/20 border-violet-400/30',
    monthly: 'text-blue-400 bg-blue-500/20 border-blue-400/30',
    yearly: 'text-cyan-400 bg-cyan-500/20 border-cyan-400/30',
    once: 'text-slate-400 bg-slate-500/20 border-slate-400/30',
};

function getPeriodicityClass(periodicity: string): string {
    const p = periodicity.toLowerCase();
    for (const [key, value] of Object.entries(PERIODICITY_STYLES)) {
        if (p.includes(key)) return value;
    }
    return 'text-muted-foreground bg-muted border-border';
}

function getPeriodicityLabel(periodicity: string): string {
    const p = periodicity.toLowerCase();
    if (p.includes('daily') || p === 'daily') return 'daily';
    if (p.includes('weekly') || p === 'weekly') return 'weekly';
    if (p.includes('monthly') || p === 'monthly') return 'monthly';
    if (p.includes('yearly') || p === 'yearly') return 'yearly';
    if (p === 'once') return 'once';
    return periodicity;
}

const STATUS_STYLES: Record<string, { label: string; cls: string }> = {
    SUCCESS: { label: 'Validé', cls: 'text-emerald-400 bg-emerald-500/20 border-emerald-400/30' },
    RUNNING: { label: 'En cours', cls: 'text-amber-400 bg-amber-500/20 border-amber-400/30' },
    MISSING: { label: 'Manquée', cls: 'text-orange-400 bg-orange-500/20 border-orange-400/30' },
    FAILED: { label: 'Échoué', cls: 'text-rose-400 bg-rose-500/20 border-rose-400/30' },
};

const BADGE_COLUMN_WIDTH = 72; // largeur fixe pour tous les badges (type + statut)

function StatusBadge({ status, className }: { status: string; className?: string }) {
    const s = STATUS_STYLES[status] ?? { label: status, cls: 'text-muted-foreground bg-muted border-border' };
    return (
        <span className={`text-[10px] h-[22px] rounded-full border font-semibold inline-flex items-center justify-center gap-1 shrink-0 leading-none w-full uppercase ${s.cls} ${className ?? ''}`}>
            {status === 'MISSING' && <AlertTriangle className="h-3 w-3" />}
            {s.label}
        </span>
    );
}

/** Affiche date et heure, format fixe pour colonne justifiée (même taille visuelle). */
function formatDateTimeRange(startStr: string, endStr: string): string {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const fmt = "dd MMM HH:mm";
    if (isSameDay(start, end)) {
        return `${format(start, 'dd MMM', { locale: fr })} ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
    }
    return `${format(start, fmt, { locale: fr })} – ${format(end, fmt, { locale: fr })}`;
}

export function TaskRow({ item, onStatusChange, onAdminAction, readonly }: TaskRowProps) {
    const [isFailDialogOpen, setIsFailDialogOpen] = useState(false);
    const { role } = useAuthStore();
    const isRunning = item.status === 'RUNNING';
    const isAdmin = role === 'ADMIN';
    const isTerminal = ['SUCCESS', 'FAILED', 'MISSING'].includes(item.status);

    const downloadMutation = useMutation({
        mutationFn: () => tasksApi.downloadProcedure(item.taskId),
        onSuccess: (blob) => {
            const originalFilename = item.procedureUrl?.replace('local:', '') || `procedure_${item.taskId}`;
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFilename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        },
        onError: (err) => {
            console.error("Failed to download procedure", err);
        }
    });

    const handleDownloadClick = (e: React.MouseEvent) => {
        if (item.procedureUrl?.startsWith('local:')) {
            e.preventDefault();
            downloadMutation.mutate();
        }
    };

    const periodEndDate = parseISO(item.periodEnd);
    const now = new Date();
    const isExpired = isRunning && isPast(periodEndDate);
    const isUrgent = isRunning && !isExpired && isBefore(subHours(periodEndDate, 1), now);

    return (
        <>
            <div className={`flex flex-col border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group ${isExpired ? 'opacity-40' : ''}`}>
                <div className="flex items-center gap-4 px-5 py-3">

                    {/* Colonne badges (type + statut), même largeur pour tous */}
                    <div
                        className="flex flex-col gap-1 shrink-0"
                        style={{ width: BADGE_COLUMN_WIDTH }}
                    >
                        <span className={`text-[10px] h-[22px] rounded-full border font-semibold inline-flex items-center justify-center leading-none w-full uppercase ${getPeriodicityClass(item.periodicity)}`}>
                            {getPeriodicityLabel(item.periodicity)}
                        </span>
                        <StatusBadge status={item.status} />
                    </div>

                    {/* Badge criticité à gauche du titre — même largeur pour tous */}
                    {(item.priority === 'CRITICAL' || item.priority === 'HIGH' || item.priority === 'MEDIUM' || item.priority === 'LOW') && (
                        <div className="shrink-0 w-[72px] flex justify-center">
                            {item.priority === 'CRITICAL' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-rose-400 bg-rose-500/20 border border-rose-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    Critical
                                </span>
                            )}
                            {item.priority === 'HIGH' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-orange-400 bg-orange-500/20 border border-orange-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    High
                                </span>
                            )}
                            {item.priority === 'MEDIUM' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    Medium
                                </span>
                            )}
                            {item.priority === 'LOW' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-blue-400 bg-blue-500/20 border border-blue-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    Low
                                </span>
                            )}
                        </div>
                    )}

                    {/* Titre + description + assignés */}
                    <div className="flex-1 min-w-0">
                        <p className="font-medium text-[13px] text-foreground truncate">{item.taskName}</p>
                        {item.description && (
                            <p className="text-[11px] text-muted-foreground/70 line-clamp-1 mt-0.5">{item.description}</p>
                        )}
                        {(item.assignedUsers.length > 0 || item.assignedGroups.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                                {item.assignedUsers.map(u => (
                                    <span key={u.id} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5 py-0.5">
                                        <Users className="h-2.5 w-2.5 opacity-60" />{u.name}
                                    </span>
                                ))}
                                {item.assignedGroups.map(g => (
                                    <span key={g.id} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground bg-muted/60 border border-border/50 rounded px-1.5 py-0.5">
                                        <Building2 className="h-2.5 w-2.5 opacity-60" />{g.name}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Date et heure — largeur fixe, tout aligné à gauche (évite le décalage) */}
                    <div
                        className="shrink-0 flex flex-col items-start font-mono text-[11px] tabular-nums text-muted-foreground"
                        style={{ width: 220 }}
                    >
                        <span className="whitespace-nowrap">
                            {formatDateTimeRange(item.periodStart, item.periodEnd)}
                        </span>
                        {isUrgent && (
                            <span className="text-[10px] text-amber-400 font-semibold mt-0.5">urgent</span>
                        )}
                        {isExpired && (
                            <span className="text-[10px] text-muted-foreground/60 font-semibold mt-0.5">en attente d'audit</span>
                        )}
                        {item.validation?.byUsername && (
                            <span className="text-[10px] text-muted-foreground/50 mt-0.5 truncate max-w-full">
                                {item.validation.byUsername}
                            </span>
                        )}
                    </div>

                    {/* ACTIONS — emplacement procédure en largeur fixe pour ne pas décaler les dates */}
                    <div className="shrink-0 flex items-center gap-1">
                        <div className="w-10 shrink-0 flex items-center justify-center">
                            {item.procedureUrl ? (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-muted-foreground/50 hover:text-foreground transition-colors"
                                    title={item.procedureUrl.startsWith('local:') ? "Télécharger la procédure" : "Ouvrir le lien web"}
                                    asChild={!item.procedureUrl.startsWith('local:')}
                                    onClick={item.procedureUrl.startsWith('local:') ? handleDownloadClick : undefined}
                                    disabled={downloadMutation.isPending}
                                >
                                    {item.procedureUrl.startsWith('local:') ? (
                                        <FileText className={`h-4 w-4 ${downloadMutation.isPending ? 'animate-pulse' : ''}`} />
                                    ) : (
                                        <a href={item.procedureUrl} target="_blank" rel="noopener noreferrer">
                                            <ExternalLink className="h-4 w-4" />
                                        </a>
                                    )}
                                </Button>
                            ) : null}
                        </div>

                        {!readonly && isRunning && (
                            <div className="flex items-center gap-0.5">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    onClick={() => onStatusChange({ taskId: item.taskId, date: item.instanceDate, status: 'SUCCESS' })}
                                >
                                    <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                                    onClick={() => setIsFailDialogOpen(true)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        )}

                        {!readonly && isAdmin && isTerminal && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground"
                                onClick={() => onAdminAction?.(item)}
                            >
                                Éditer
                            </Button>
                        )}
                    </div>
                </div>

                {item.status === 'FAILED' && item.validation?.comment && (
                    <div className="px-16 pb-3">
                        <Alert variant="destructive" className="py-2 bg-rose-500/10 text-rose-400 border-rose-500/20">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-xs font-semibold mb-1">Détails de l'échec</AlertTitle>
                            <AlertDescription className="text-xs opacity-90">
                                {item.validation.comment}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </div>

            <FailTaskDialog
                open={isFailDialogOpen}
                onOpenChange={setIsFailDialogOpen}
                onConfirm={(comment) => onStatusChange({ taskId: item.taskId, date: item.instanceDate, status: 'FAILED', comment })}
            />
        </>
    );
}
