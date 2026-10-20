import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Check, X, ExternalLink, Users, Building2, FileText, AlertTriangle, Loader2, ClipboardList } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { BoardItem, TaskStatusValue } from '@/api/types';
import { useAuthStore } from '@/stores/auth-store';
import { tasksApi } from "@/api/tasks";
import { useMutation } from "@tanstack/react-query";
import { ExecutionDialog } from './execution-dialog';
import { format, parseISO, isPast, isBefore, subHours, isSameDay } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import type { Locale } from 'date-fns';

interface TaskRowProps {
    item: BoardItem;
    onStatusChange: (data: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) => void;
    onAdminAction?: (item: BoardItem) => void;
    readonly?: boolean;
    isUpdating?: boolean;
    compact?: boolean;
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

const STATUS_STYLE_CLS: Record<string, string> = {
    SUCCESS: 'text-emerald-400 bg-emerald-500/20 border-emerald-400/30',
    RUNNING: 'text-amber-400 bg-amber-500/20 border-amber-400/30',
    MISSING: 'text-orange-400 bg-orange-500/20 border-orange-400/30',
    FAILED: 'text-rose-400 bg-rose-500/20 border-rose-400/30',
};

const STATUS_I18N_KEYS: Record<string, string> = {
    SUCCESS: 'statusSuccess',
    RUNNING: 'statusRunning',
    MISSING: 'statusMissing',
    FAILED: 'statusFailed',
};

const BADGE_COLUMN_WIDTH = 72; // largeur fixe pour tous les badges (type + statut)

function StatusBadge({ status, className }: { status: string; className?: string }) {
    const { t } = useTranslation();
    const label = STATUS_I18N_KEYS[status] ? t(`taskBoard.${STATUS_I18N_KEYS[status]}`) : status;
    const cls = STATUS_STYLE_CLS[status] ?? 'text-muted-foreground bg-muted border-border';
    return (
        <span className={`text-[10px] h-[22px] rounded-full border font-semibold inline-flex items-center justify-center gap-1 shrink-0 leading-none w-full uppercase ${cls} ${className ?? ''}`}>
            {status === 'MISSING' && <AlertTriangle className="h-3 w-3" />}
            {label}
        </span>
    );
}

/** Affiche date et heure, format fixe pour colonne justifiée (même taille visuelle). */
function formatDateTimeRange(startStr: string, endStr: string, locale: Locale): string {
    const start = parseISO(startStr);
    const end = parseISO(endStr);
    const fmt = "dd MMM HH:mm";
    if (isSameDay(start, end)) {
        return `${format(start, 'dd MMM', { locale })} ${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
    }
    return `${format(start, fmt, { locale })} – ${format(end, fmt, { locale })}`;
}

export function TaskRow({ item, onStatusChange, onAdminAction, readonly, isUpdating = false, compact = false }: TaskRowProps) {
    const { t, i18n } = useTranslation();
    const locale = i18n.resolvedLanguage?.startsWith('fr') ? fr : enUS;
    const [executionStatus, setExecutionStatus] = useState<'SUCCESS' | 'FAILED' | 'REPORT' | null>(null);
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
            <div aria-busy={isUpdating} data-testid={`task-row-${item.taskId}-${item.instanceDate}`} className={`flex flex-col border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors group ${isExpired ? 'opacity-40' : ''}`}>
                <div className={`flex items-center gap-4 px-5 ${compact ? 'py-1.5' : 'py-3'}`}>

                    {/* Colonne badges (type + statut), même largeur pour tous */}
                    <div
                        className="flex flex-col gap-1 shrink-0"
                        style={{ width: BADGE_COLUMN_WIDTH }}
                    >
                        <span className={`text-[10px] h-[22px] rounded-full border font-semibold inline-flex items-center justify-center leading-none w-full uppercase ${getPeriodicityClass(item.periodicity)}`}>
                            {t(`taskBoard.periodicity_${getPeriodicityLabel(item.periodicity)}`, { defaultValue: item.periodicity })}
                        </span>
                        <StatusBadge status={item.status} />
                    </div>

                    {/* Badge criticité à gauche du titre — même largeur pour tous */}
                    {(item.priority === 'CRITICAL' || item.priority === 'HIGH' || item.priority === 'MEDIUM' || item.priority === 'LOW') && (
                        <div className="shrink-0 w-[72px] flex justify-center">
                            {item.priority === 'CRITICAL' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-rose-400 bg-rose-500/20 border border-rose-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    {t('taskBoard.priorityCritical')}
                                </span>
                            )}
                            {item.priority === 'HIGH' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-orange-400 bg-orange-500/20 border border-orange-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    {t('taskBoard.priorityHigh')}
                                </span>
                            )}
                            {item.priority === 'MEDIUM' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    {t('taskBoard.priorityMedium')}
                                </span>
                            )}
                            {item.priority === 'LOW' && (
                                <span className="text-[9px] h-[22px] px-2 rounded font-bold text-blue-400 bg-blue-500/20 border border-blue-400/30 uppercase tracking-wide inline-flex items-center justify-center w-full">
                                    {t('taskBoard.priorityLow')}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Titre + description + assignés */}
                    <div className="flex-1 min-w-0">
                        <p title={compact ? item.description : undefined} className="font-medium text-[13px] text-foreground truncate">{item.taskName}</p>
                        {!compact && item.description && (
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
                            {formatDateTimeRange(item.periodStart, item.periodEnd, locale)}
                        </span>
                        {isUrgent && (
                            <span className="text-[10px] text-amber-400 font-semibold mt-0.5">{t('taskBoard.urgent')}</span>
                        )}
                        {isExpired && (
                            <span className="text-[10px] text-muted-foreground/60 font-semibold mt-0.5">{t('taskBoard.awaitingAudit')}</span>
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
                                    title={item.procedureUrl.startsWith('local:') ? t('taskBoard.downloadProcedure') : t('taskBoard.openProcedure')}
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

                        {/* Validate / fail, or the report: one slot of fixed width so the dates stay aligned on every row. */}
                        <div className="flex w-[68px] shrink-0 items-center justify-center gap-0.5">
                        {!readonly && isRunning && (
                            <>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                                    disabled={isUpdating}
                                    aria-label={t('taskBoard.validateTask', { name: item.taskName })}
                                    onClick={() => item.executionChecklist?.length ? setExecutionStatus('SUCCESS') : onStatusChange({ taskId: item.taskId, date: item.instanceDate, status: 'SUCCESS' })}
                                >
                                    <>{isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</>
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 rounded-lg text-rose-500 hover:text-rose-400 hover:bg-rose-500/10"
                                    disabled={isUpdating}
                                    aria-label={t('taskBoard.failTask', { name: item.taskName })}
                                    onClick={() => setExecutionStatus('FAILED')}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </>
                        )}

                        {isTerminal && !!item.executionRecord?.length && (
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-lg text-muted-foreground hover:bg-primary/10 hover:text-primary"
                                aria-label={t('execution.report')}
                                title={t('execution.report')}
                                onClick={() => setExecutionStatus('REPORT')}
                            >
                                <ClipboardList className="h-4 w-4" />
                            </Button>
                        )}
                        </div>

                        {/* Reserved for every admin row, read-only or not, so all rows keep the same width. */}
                        {isAdmin && (
                            <div className="flex w-16 shrink-0 justify-center">
                                {!readonly && isTerminal && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 text-xs text-muted-foreground/50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:text-foreground"
                                        onClick={() => onAdminAction?.(item)}
                                    >
                                        {t('common.edit')}
                                    </Button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {item.status === 'FAILED' && item.validation?.comment && (
                    <div className="px-16 pb-3">
                        <Alert variant="destructive" className="py-2 bg-rose-500/10 text-rose-400 border-rose-500/20">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-xs font-semibold mb-1">{t('taskBoard.failureDetails')}</AlertTitle>
                            <AlertDescription className="text-xs opacity-90">
                                {item.validation.comment}
                            </AlertDescription>
                        </Alert>
                    </div>
                )}
            </div>

            {executionStatus && <ExecutionDialog item={item} status={executionStatus === 'FAILED' ? 'FAILED' : 'SUCCESS'} readOnly={executionStatus === 'REPORT'} onClose={() => setExecutionStatus(null)} />}

        </>
    );
}
