import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import type { AuditLog } from "@/api/types";
import { format } from "date-fns";
import { Info, AlertTriangle, AlertOctagon, ShieldCheck, ChevronRight, Cpu } from "lucide-react";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/date-locale";
import { cn } from "@/lib/utils";
import { CATEGORY_TONE } from "./audit-style";

interface AuditLogTableProps {
    logs: AuditLog[];
    isLoading: boolean;
    onViewDetails: (log: AuditLog) => void;
}

export function AuditLogTable({ logs, isLoading, onViewDetails }: AuditLogTableProps) {
    const { t } = useTranslation();
    const locale = getDateLocale();

    if (isLoading) {
        return (
            <div role="status" aria-label={t('auditLog.loading')} className="space-y-3 p-4">
                {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4">
                        <Skeleton className="h-9 w-28" />
                        <Skeleton className="h-6 w-20 rounded-full" />
                        <Skeleton className="h-6 w-32" />
                        <Skeleton className="h-6 flex-1" />
                    </div>
                ))}
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                    <ShieldCheck className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">{t('auditLog.empty')}</p>
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead className="h-11 pl-5 text-xs font-medium uppercase tracking-wide">{t('auditLog.columns.timestamp')}</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide">{t('auditLog.columns.severity')}</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide">{t('auditLog.columns.actor')}</TableHead>
                    <TableHead className="text-xs font-medium uppercase tracking-wide">{t('auditLog.columns.action')}</TableHead>
                    <TableHead className="hidden text-xs font-medium uppercase tracking-wide md:table-cell">{t('auditLog.columns.category')}</TableHead>
                    <TableHead className="hidden text-xs font-medium uppercase tracking-wide lg:table-cell">{t('auditLog.columns.target')}</TableHead>
                    <TableHead className="w-10"><span className="sr-only">{t('auditLog.openDetails')}</span></TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {logs.map((log) => {
                    const when = new Date(log.timestamp);
                    return (
                        <TableRow
                            key={log.id}
                            tabIndex={0}
                            className="group cursor-pointer transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                            onClick={() => onViewDetails(log)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    onViewDetails(log);
                                }
                            }}
                        >
                            <TableCell className="py-3 pl-5">
                                <div className="text-sm font-medium tabular-nums">{format(when, 'HH:mm:ss')}</div>
                                <div className="text-xs text-muted-foreground">{format(when, 'd MMM yyyy', { locale })}</div>
                            </TableCell>
                            <TableCell>
                                <SeverityBadge severity={log.severity} />
                            </TableCell>
                            <TableCell>
                                {log.actorName ? (
                                    <div className="flex items-center gap-2">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                            {log.actorName.substring(0, 2).toUpperCase()}
                                        </span>
                                        <span className="text-sm font-medium">{log.actorName}</span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2 text-sm italic text-muted-foreground">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
                                            <Cpu className="h-3.5 w-3.5" />
                                        </span>
                                        {t('auditLog.systemActor')}
                                    </div>
                                )}
                            </TableCell>
                            <TableCell>
                                <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{log.action}</code>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", CATEGORY_TONE[log.category] ?? CATEGORY_TONE.SYSTEM)}>
                                    {t(`auditLog.categories.${log.category.toLowerCase()}`, { defaultValue: log.category })}
                                </span>
                            </TableCell>
                            <TableCell className="hidden max-w-[220px] truncate text-sm text-muted-foreground lg:table-cell">
                                {log.target || '—'}
                            </TableCell>
                            <TableCell className="pr-4 text-right">
                                <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                            </TableCell>
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}

export function SeverityBadge({ severity }: { severity: string }) {
    const { t } = useTranslation();
    const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";

    switch (severity) {
        case 'CRITICAL':
            return (
                <span className={cn(base, "bg-red-500/10 text-red-700 dark:text-red-400")}>
                    <AlertOctagon className="h-3 w-3" /> {t('auditLog.severity.critical')}
                </span>
            );
        case 'WARN':
            return (
                <span className={cn(base, "bg-amber-500/10 text-amber-700 dark:text-amber-400")}>
                    <AlertTriangle className="h-3 w-3" /> {t('auditLog.severity.warning')}
                </span>
            );
        case 'INFO':
        default:
            return (
                <span className={cn(base, "bg-sky-500/10 text-sky-700 dark:text-sky-400")}>
                    <Info className="h-3 w-3" /> {t('auditLog.severity.info')}
                </span>
            );
    }
}
