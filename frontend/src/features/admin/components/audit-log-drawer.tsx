import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AuditLog } from "@/api/types";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateLocale } from "@/lib/date-locale";
import { SeverityBadge } from "./audit-log-table";
import { CATEGORY_TONE } from "./audit-style";
import { useTranslation } from "react-i18next";

interface AuditLogDrawerProps {
    log: AuditLog | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function DiffViewer({ details }: { details: Record<string, unknown> }) {
    const { t } = useTranslation();

    if (!details || typeof details !== 'object') return null;

    // Check if it looks like a diff (keys map to { from, to })
    const entries = Object.entries(details);
    const isDiff = entries.every(([, val]: [string, unknown]) =>
        val !== null && typeof val === 'object' && ('from' in val || 'to' in val)
    );

    if (!isDiff) {
        return <pre className="text-xs">{JSON.stringify(details, null, 2)}</pre>;
    }

    return (
        <div className="space-y-3">
            {entries.map(([key, diff]: [string, unknown]) => (
                <div key={key} className="text-sm border-b pb-2 last:border-0 border-zinc-800">
                    <div className="font-semibold text-zinc-400 mb-1">{key}</div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-red-950/30 text-red-200 p-2 rounded border border-red-900/50 break-all">
                            <div className="text-[10px] uppercase text-red-500 mb-0.5">{t('auditLog.diff.before')}</div>
                            {JSON.stringify((diff as Record<string, unknown>)?.from)}
                        </div>
                        <div className="bg-green-950/30 text-green-200 p-2 rounded border border-green-900/50 break-all">
                            <div className="text-[10px] uppercase text-green-500 mb-0.5">{t('auditLog.diff.after')}</div>
                            {JSON.stringify((diff as Record<string, unknown>)?.to)}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function AuditLogDrawer({ log, open, onOpenChange }: AuditLogDrawerProps) {
    const { t } = useTranslation();

    if (!log) return null;

    let parsedDetails = null;
    try {
        if (log.details) {
            parsedDetails = JSON.parse(log.details);
        }
    } catch {
        parsedDetails = log.details;
    }

    const field = (label: string, value: React.ReactNode, mono = false) => (
        <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className={cn("mt-1 break-all text-sm", mono && "font-mono")}>{value}</div>
        </div>
    );

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="flex h-full w-full flex-col gap-0 p-0 sm:max-w-xl">
                <SheetHeader className="space-y-0 border-b p-6 text-left">
                    <div className="flex items-start gap-3 pr-8">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
                            <ScrollText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <SheetTitle className="text-lg">{t('auditLog.detailsTitle')}</SheetTitle>
                            <SheetDescription>{t('auditLog.transactionId', { id: log.id })}</SheetDescription>
                        </div>
                    </div>
                </SheetHeader>

                <ScrollArea className="min-h-0 flex-1">
                    <div className="space-y-5 p-6">
                        <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <SeverityBadge severity={log.severity} />
                                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", CATEGORY_TONE[log.category] ?? CATEGORY_TONE.SYSTEM)}>
                                    {t(`auditLog.categories.${log.category.toLowerCase()}`, { defaultValue: log.category })}
                                </span>
                            </div>
                            <code className="block break-all rounded-lg bg-muted px-3 py-2 font-mono text-sm font-semibold">{log.action}</code>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            {field(t('auditLog.columns.timestamp'), format(new Date(log.timestamp), 'PPP · HH:mm:ss', { locale: getDateLocale() }))}
                            {field(t('auditLog.columns.actor'), <>{log.actorName || t('auditLog.systemActor')}{log.actorId ? <span className="text-muted-foreground"> · ID {log.actorId}</span> : null}</>)}
                            {field(t('auditLog.columns.target'), log.target || t('auditLog.notAvailable'), true)}
                            {field(t('auditLog.ipAddress'), log.ipAddress || t('auditLog.unknown'), true)}
                        </div>

                        {/* Payload */}
                        <div className="space-y-2">
                            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('auditLog.changesDetails')}</span>
                            <div className="overflow-x-auto rounded-xl border bg-zinc-950 p-4 font-mono text-xs text-zinc-50 dark:bg-zinc-900">
                                {parsedDetails ? (
                                    <DiffViewer details={parsedDetails} />
                                ) : (
                                    <span className="italic text-zinc-500">{t('auditLog.noAdditionalDetails')}</span>
                                )}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
