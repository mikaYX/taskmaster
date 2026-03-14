import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { auditApi } from "@/api";
import type { AuditLog } from "@/api/types";
import { AuditLogTable } from "../components/audit-log-table";
import { AuditLogDrawer } from "../components/audit-log-drawer";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, Filter, RefreshCcw } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

export function AuditLogPage() {
    const [page, setPage] = useState(1);
    const [limit] = useState(20);
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

    // Filters
    const [category, setCategory] = useState<string>("ALL");
    const [date, setDate] = useState<Date | undefined>(undefined);

    const { data, isLoading, refetch, isRefetching } = useQuery({
        queryKey: ['audit-logs', page, limit, category, date],
        queryFn: () => auditApi.getLogs({
            skip: (page - 1) * limit,
            take: limit,
            category: category === "ALL" ? undefined : category,
            from: date ? date.toISOString() : undefined,
            // If date is selected, we might want end of day, but simplistic for now
        })
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
                    <p className="text-muted-foreground">
                        Traceability and security events log.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
                        <RefreshCcw className={cn("mr-2 h-4 w-4", isRefetching && "animate-spin")} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-sm">
                <div className="flex items-center gap-2 px-2 text-sm text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    <span>Filters:</span>
                </div>
                <div className="h-6 w-px bg-border mx-1" />

                <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-[180px] h-9">
                        <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">All Categories</SelectItem>
                        <SelectItem value="AUTH">Authentication</SelectItem>
                        <SelectItem value="USER">User Management</SelectItem>
                        <SelectItem value="GROUP">Group Management</SelectItem>
                        <SelectItem value="TASK">Tasks</SelectItem>
                        <SelectItem value="SETTINGS">Settings</SelectItem>
                        <SelectItem value="SYSTEM">System</SelectItem>
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant={"outline"}
                            size="sm"
                            className={cn(
                                "w-[240px] justify-start text-left font-normal h-9",
                                !date && "text-muted-foreground"
                            )}
                        >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {date ? format(date, "PPP") : <span>Pick a date</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={setDate}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                {/* Clear Filters */}
                {(category !== "ALL" || date) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setCategory("ALL"); setDate(undefined); }}
                        className="h-9 px-2 lg:px-3"
                    >
                        Reset
                    </Button>
                )}
            </div>

            <AuditLogTable
                logs={data?.data || []}
                isLoading={isLoading}
                onViewDetails={setSelectedLog}
            />

            {/* Pagination Controls */}
            {data && (
                <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                        Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, data.total)} of {data.total} entries
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page * limit >= data.total}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}

            <AuditLogDrawer
                log={selectedLog}
                open={!!selectedLog}
                onOpenChange={(open) => !open && setSelectedLog(null)}
            />
        </div>
    );
}
