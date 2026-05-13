import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AuditLog } from "@/api/types";
import { format } from "date-fns";
import { Info, AlertTriangle, AlertOctagon, User, ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AuditLogTableProps {
    logs: AuditLog[];
    isLoading: boolean;
    onViewDetails: (log: AuditLog) => void;
}

export function AuditLogTable({ logs, isLoading, onViewDetails }: AuditLogTableProps) {
    const { t } = useTranslation();

    if (isLoading) {
        return (
            <div className="rounded-md border p-8 text-center text-muted-foreground">
                {t('auditLog.loading')}
            </div>
        );
    }

    if (logs.length === 0) {
        return (
            <div className="rounded-md border p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                <ShieldAlert className="h-8 w-8 opacity-20" />
                <p>{t('auditLog.empty')}</p>
            </div>
        );
    }

    return (
        <div className="rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="w-[180px]">{t('auditLog.columns.timestamp')}</TableHead>
                        <TableHead className="w-[100px]">{t('auditLog.columns.severity')}</TableHead>
                        <TableHead className="w-[150px]">{t('auditLog.columns.actor')}</TableHead>
                        <TableHead className="w-[200px]">{t('auditLog.columns.action')}</TableHead>
                        <TableHead className="w-[150px]">{t('auditLog.columns.category')}</TableHead>
                        <TableHead>{t('auditLog.columns.target')}</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {logs.map((log) => (
                        <TableRow
                            key={log.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => onViewDetails(log)}
                        >
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {format(new Date(log.timestamp), 'yyyy-MM-dd HH:mm:ss')}
                            </TableCell>
                            <TableCell>
                                <SeverityBadge severity={log.severity} />
                            </TableCell>
                            <TableCell>
                                <div className="flex items-center gap-2">
                                    {log.actorName ? (
                                        <>
                                            <User className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-sm font-medium">{log.actorName}</span>
                                        </>
                                    ) : (
                                        <span className="text-sm text-muted-foreground italic">{t('auditLog.systemActor')}</span>
                                    )}
                                </div>
                            </TableCell>
                            <TableCell>
                                <code className="text-xs bg-muted px-1 py-0.5 rounded">{log.action}</code>
                            </TableCell>
                            <TableCell>
                                <Badge variant="outline" className="text-xs font-normal">
                                    {log.category}
                                </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                                {log.target || '-'}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    );
}

function SeverityBadge({ severity }: { severity: string }) {
    const { t } = useTranslation();

    switch (severity) {
        case 'CRITICAL':
            return (
                <Badge variant="destructive" className="gap-1">
                    <AlertOctagon className="h-3 w-3" /> {t('auditLog.severity.critical')}
                </Badge>
            );
        case 'WARN':
            return (
                <Badge variant="default" className="bg-amber-500 hover:bg-amber-600 gap-1 text-white border-transparent">
                    <AlertTriangle className="h-3 w-3" /> {t('auditLog.severity.warning')}
                </Badge>
            );
        case 'INFO':
        default:
            return (
                <Badge variant="secondary" className="gap-1">
                    <Info className="h-3 w-3 text-blue-500" /> {t('auditLog.severity.info')}
                </Badge>
            );
    }
}
