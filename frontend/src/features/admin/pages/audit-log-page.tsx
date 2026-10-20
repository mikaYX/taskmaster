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
import { CalendarIcon, ChevronLeft, ChevronRight, Filter, RefreshCcw, ScrollText, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getDateLocale } from "@/lib/date-locale";
import { useTranslation } from "react-i18next";

const CATEGORIES = ["AUTH", "USER", "GROUP", "TASK", "SETTINGS", "SYSTEM"] as const;

export function AuditLogPage() {
    const { t } = useTranslation();
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

    const pages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1;
    const filtered = category !== "ALL" || !!date;

    return (
        <div className="mx-auto w-full max-w-6xl space-y-6 pb-24 pt-4 sm:pt-6">
            {/* ========== HEADER ========== */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
                        <ScrollText className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('auditLog.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('auditLog.description')}</p>
                    </div>
                </div>
                <Button variant="outline" className="gap-2" onClick={() => refetch()} disabled={isRefetching}>
                    <RefreshCcw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
                    {t('common.refresh')}
                </Button>
            </div>

            {/* ========== FILTERS ========== */}
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
                <span className="flex items-center gap-2 px-1 text-sm font-medium text-muted-foreground">
                    <Filter className="h-4 w-4" />
                    {t('auditLog.filters')}
                </span>

                <Select value={category} onValueChange={(value) => { setCategory(value); setPage(1); }}>
                    <SelectTrigger className="w-full sm:w-[200px]" aria-label={t('auditLog.category')}>
                        <SelectValue placeholder={t('auditLog.category')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="ALL">{t('auditLog.categories.all')}</SelectItem>
                        {CATEGORIES.map((value) => (
                            <SelectItem key={value} value={value}>{t(`auditLog.categories.${value.toLowerCase()}`)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Popover>
                    <PopoverTrigger asChild>
                        <Button
                            variant="outline"
                            className={cn("w-full justify-start gap-2 text-left font-normal sm:w-[240px]", !date && "text-muted-foreground")}
                        >
                            <CalendarIcon className="h-4 w-4" />
                            {date ? format(date, "PPP", { locale: getDateLocale() }) : <span>{t('auditLog.pickDate')}</span>}
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                            mode="single"
                            selected={date}
                            onSelect={(value) => { setDate(value); setPage(1); }}
                            initialFocus
                        />
                    </PopoverContent>
                </Popover>

                {filtered && (
                    <Button
                        variant="ghost"
                        className="gap-1.5 text-muted-foreground"
                        onClick={() => { setCategory("ALL"); setDate(undefined); setPage(1); }}
                    >
                        <X className="h-3.5 w-3.5" />
                        {t('common.reset')}
                    </Button>
                )}
            </div>

            {/* ========== LIST ========== */}
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <AuditLogTable
                    logs={data?.data || []}
                    isLoading={isLoading}
                    onViewDetails={setSelectedLog}
                />

                {data && data.total > 0 && (
                    <div className="flex flex-col items-center justify-between gap-3 border-t bg-muted/30 px-5 py-3 sm:flex-row">
                        <p className="text-sm text-muted-foreground">
                            {t('auditLog.showingEntries', {
                                start: ((page - 1) * limit) + 1,
                                end: Math.min(page * limit, data.total),
                                total: data.total,
                            })}
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                            >
                                <ChevronLeft className="h-4 w-4" />
                                {t('common.previous')}
                            </Button>
                            <span className="px-2 text-sm tabular-nums text-muted-foreground">{page} / {pages}</span>
                            <Button
                                variant="outline"
                                size="sm"
                                className="gap-1"
                                onClick={() => setPage(p => p + 1)}
                                disabled={page * limit >= data.total}
                            >
                                {t('common.next')}
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            <AuditLogDrawer
                log={selectedLog}
                open={!!selectedLog}
                onOpenChange={(open) => !open && setSelectedLog(null)}
            />
        </div>
    );
}
