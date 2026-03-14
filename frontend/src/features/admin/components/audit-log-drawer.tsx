import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { AuditLog } from "@/api/types";
import { format } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface AuditLogDrawerProps {
    log: AuditLog | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

// ... imports

function DiffViewer({ details }: { details: Record<string, unknown> }) {
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
                            <div className="text-[10px] uppercase text-red-500 mb-0.5">Before</div>
                            {JSON.stringify((diff as Record<string, unknown>)?.from)}
                        </div>
                        <div className="bg-green-950/30 text-green-200 p-2 rounded border border-green-900/50 break-all">
                            <div className="text-[10px] uppercase text-green-500 mb-0.5">After</div>
                            {JSON.stringify((diff as Record<string, unknown>)?.to)}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}

export function AuditLogDrawer({ log, open, onOpenChange }: AuditLogDrawerProps) {
    if (!log) return null;

    let parsedDetails = null;
    try {
        if (log.details) {
            parsedDetails = JSON.parse(log.details);
        }
    } catch {
        parsedDetails = log.details;
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="sm:max-w-xl flex flex-col h-full">
                <SheetHeader>
                    <SheetTitle>Audit Log Details</SheetTitle>
                    <SheetDescription>
                        Transaction ID: #{log.id}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 -mx-6 px-6">
                    <div className="mt-6 space-y-6 pb-6">
                        {/* Header Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">Timestamp</span>
                                <div className="text-sm font-mono">
                                    {format(new Date(log.timestamp), 'PPP pp')}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">Severity</span>
                                <div>
                                    <Badge variant={log.severity === 'CRITICAL' ? 'destructive' : log.severity === 'WARN' ? 'default' : 'secondary'}>
                                        {log.severity}
                                    </Badge>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-xs font-medium text-muted-foreground uppercase">Action</span>
                            <div className="text-base font-semibold">{log.action}</div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">Category</span>
                                <div className="text-sm">{log.category}</div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">Target</span>
                                <div className="text-sm font-mono bg-muted inline-block px-1 rounded">
                                    {log.target || 'N/A'}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">Actor</span>
                                <div className="text-sm">{log.actorName || 'System'} {log.actorId ? `(ID: ${log.actorId})` : ''}</div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase">IP Address</span>
                                <div className="text-sm font-mono">{log.ipAddress || 'Unknown'}</div>
                            </div>
                        </div>

                        {/* Payload */}
                        <div className="space-y-2">
                            <span className="text-xs font-medium text-muted-foreground uppercase">Changes / Details</span>
                            <div className="rounded-md border bg-zinc-950 p-4 font-mono text-xs text-zinc-50 dark:bg-zinc-900">
                                {parsedDetails ? (
                                    <DiffViewer details={parsedDetails} />
                                ) : (
                                    <span className="text-zinc-500 italic">No additional details recorded.</span>
                                )}
                            </div>
                        </div>
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}
