import { useState, useMemo, useCallback } from 'react';
import {
    LayoutDashboard, ListChecks, Users, FileDown,
    CheckCircle2, XCircle, AlertTriangle, Activity, Download,
    FileSpreadsheet, FileText, BarChart2, Copy, Package, ArrowUpDown, Settings2, Plus, Minus,
    Monitor, X,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip as RechartsTooltip, ResponsiveContainer,
} from 'recharts';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Card, CardContent, CardHeader, CardTitle, CardDescription,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

import { useAuthStore } from '@/stores/auth-store';
import {
    useAnalyticsOverview,
    useAnalyticsTrend,
    useAnalyticsByTask,
    useAnalyticsByUser,
} from '@/hooks/use-analytics';
import { analyticsApi } from '@/api/analytics';
import type { AnalyticsOverview, AnalyticsByTask } from '@/api/types';

// ─────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────

type PeriodKey = '1' | '7' | '30' | '90';
type KpiKey = 'success' | 'failed' | 'missing' | 'total';

export interface ComplianceThresholds {
    warningThreshold: number;
    criticalThreshold: number;
}

const DEFAULT_THRESHOLDS: ComplianceThresholds = { warningThreshold: 70, criticalThreshold: 50 };
const THRESHOLDS_KEY = 'analytics.thresholds';

const PERIODS: { value: PeriodKey; label: string }[] = [
    { value: '1', label: "Auj." },
    { value: '7', label: '7j' },
    { value: '30', label: '30j' },
    { value: '90', label: '90j' },
];

// ─────────────────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────────────────

function useComplianceThresholds() {
    const [thresholds, setThresholds] = useState<ComplianceThresholds>(() => {
        try {
            const raw = localStorage.getItem(THRESHOLDS_KEY);
            if (raw) return JSON.parse(raw) as ComplianceThresholds;
        } catch { /* ignore corrupt storage */ }
        return DEFAULT_THRESHOLDS;
    });

    const save = useCallback((next: ComplianceThresholds) => {
        setThresholds(next);
        localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(next));
    }, []);

    return { thresholds, setThresholds: save };
}

// ─────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────

function getComplianceColor(rate: number, t: ComplianceThresholds = DEFAULT_THRESHOLDS) {
    if (rate >= t.warningThreshold) return { text: 'text-emerald-500', bg: 'bg-emerald-500/15', progress: '[&>[data-slot=progress-indicator]]:bg-emerald-500' };
    if (rate >= t.criticalThreshold) return { text: 'text-amber-500', bg: 'bg-amber-500/15', progress: '[&>[data-slot=progress-indicator]]:bg-amber-500' };
    return { text: 'text-red-500', bg: 'bg-red-500/15', progress: '[&>[data-slot=progress-indicator]]:bg-red-500' };
}

function getInitials(fullname: string | null, username: string): string {
    const name = fullname || username;
    return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function useDateRange(period: PeriodKey) {
    return useMemo(() => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - (Number(period) - 1));
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
        };
    }, [period]);
}

// ─────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────

function KpiSkeleton() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="p-6 space-y-3">
                    <div className="flex justify-between items-start">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-9 rounded-full" />
                    </div>
                    <Skeleton className="h-10 w-20" />
                    <Skeleton className="h-2 w-full rounded-full" />
                </Card>
            ))}
        </div>
    );
}

function ChartSkeleton() {
    return (
        <Card>
            <CardHeader>
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-32 mt-1" />
            </CardHeader>
            <CardContent>
                <Skeleton className="h-[280px] w-full rounded-lg" />
            </CardContent>
        </Card>
    );
}

function TableSkeleton({ cols = 4 }: { cols?: number }) {
    return (
        <div className="space-y-2 p-4">
            <div className="flex gap-4 pb-2 border-b">
                {Array.from({ length: cols }).map((_, i) => (
                    <Skeleton key={i} className="h-4 flex-1" />
                ))}
            </div>
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex gap-4 py-2">
                    {Array.from({ length: cols }).map((_, j) => (
                        <Skeleton key={j} className="h-5 flex-1" />
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Custom Recharts Tooltip
// ─────────────────────────────────────────────────────────

interface TooltipPayloadItem {
    name: string;
    value: number;
    color: string;
}

interface CustomTooltipProps {
    active?: boolean;
    payload?: TooltipPayloadItem[];
    label?: string;
}

function CustomChartTooltip({ active, payload, label }: CustomTooltipProps) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-card border border-border rounded-lg shadow-lg px-4 py-3 text-sm min-w-[160px]">
            <p className="font-semibold text-foreground mb-2">{label}</p>
            {payload.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.name}
                    </span>
                    <span className="font-medium text-foreground">{entry.value}</span>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Overview Tab
// ─────────────────────────────────────────────────────────

const KPI_CONFIG = [
    {
        key: 'success' as const,
        label: 'Succès',
        icon: CheckCircle2,
        iconBg: 'bg-emerald-500/15',
        iconColor: 'text-emerald-500',
        badgeClass: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
        progressClass: '[&>[data-slot=progress-indicator]]:bg-emerald-500',
    },
    {
        key: 'failed' as const,
        label: 'Échecs',
        icon: XCircle,
        iconBg: 'bg-red-500/15',
        iconColor: 'text-red-500',
        badgeClass: 'bg-red-500/15 text-red-600 dark:text-red-400',
        progressClass: '[&>[data-slot=progress-indicator]]:bg-red-500',
    },
    {
        key: 'missing' as const,
        label: 'Manquants',
        icon: AlertTriangle,
        iconBg: 'bg-amber-500/15',
        iconColor: 'text-amber-500',
        badgeClass: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
        progressClass: '[&>[data-slot=progress-indicator]]:bg-amber-500',
    },
    {
        key: 'total' as const,
        label: 'Total',
        icon: Activity,
        iconBg: 'bg-blue-500/15',
        iconColor: 'text-blue-500',
        badgeClass: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
        progressClass: '[&>[data-slot=progress-indicator]]:bg-blue-500',
    },
] as const;

const KPI_STATUS_MAP: Record<Exclude<KpiKey, 'total'>, { sortKey: 'failed'; sortDir: 'desc' | 'asc' }> = {
    success: { sortKey: 'failed', sortDir: 'asc' },
    failed: { sortKey: 'failed', sortDir: 'desc' },
    missing: { sortKey: 'failed', sortDir: 'desc' },
};

interface KpiDetailSheetProps {
    kpiKey: KpiKey | null;
    onClose: () => void;
    overview: AnalyticsOverview | undefined;
    byTask: AnalyticsByTask[] | undefined;
    onSwitchTab: () => void;
}

function KpiDetailSheet({ kpiKey, onClose, overview, byTask, onSwitchTab }: KpiDetailSheetProps) {
    const cfg = KPI_CONFIG.find((c) => c.key === kpiKey);
    const total = overview?.total ?? 0;

    const topTasks = useMemo(() => {
        if (!byTask || !kpiKey) return [];
        if (kpiKey === 'total') return [...byTask].sort((a, b) => b.total - a.total).slice(0, 10);
        const { sortDir } = KPI_STATUS_MAP[kpiKey];
        return [...byTask]
            .sort((a, b) => sortDir === 'desc' ? b.failed - a.failed : a.failed - b.failed)
            .slice(0, 10);
    }, [byTask, kpiKey]);

    if (!cfg || kpiKey === null) return null;
    const Icon = cfg.icon;
    const value = overview?.[cfg.key] ?? 0;

    return (
        <Sheet open={kpiKey !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
            <SheetContent side="right" className="sm:max-w-sm w-full flex flex-col p-0">
                <SheetHeader className="p-6 border-b">
                    <SheetTitle className="flex items-center gap-3">
                        <div className={`rounded-full p-2 ${cfg.iconBg} shrink-0`}>
                            <Icon className={`h-5 w-5 ${cfg.iconColor}`} />
                        </div>
                        {cfg.label}
                        <Badge className={cfg.badgeClass}>{value}</Badge>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 p-6">
                    {kpiKey === 'total' ? (
                        <div className="space-y-5">
                            <p className="text-sm font-semibold text-muted-foreground">Répartition</p>
                            {[
                                { label: 'Succès', value: overview?.success ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-emerald-500', text: 'text-emerald-500' },
                                { label: 'Échecs', value: overview?.failed ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-red-500', text: 'text-red-500' },
                                { label: 'Manquants', value: overview?.missing ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-amber-500', text: 'text-amber-500' },
                            ].map((s) => {
                                const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                                return (
                                    <div key={s.label} className="space-y-1.5">
                                        <div className="flex justify-between text-sm">
                                            <span>{s.label}</span>
                                            <span className={`font-semibold tabular-nums ${s.text}`}>{s.value} ({pct}%)</span>
                                        </div>
                                        <Progress value={pct} className={`h-2 ${s.cls}`} />
                                    </div>
                                );
                            })}
                            <Separator className="my-4" />
                            <p className="text-sm font-semibold text-muted-foreground">Top 10 tâches</p>
                            {topTasks.map((t) => {
                                const c = getComplianceColor(t.complianceRate);
                                return (
                                    <div key={t.taskId} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <span className="text-sm truncate max-w-[180px]">{t.taskName}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-muted-foreground tabular-nums">{t.total}</span>
                                            <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{t.complianceRate.toFixed(0)}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <p className="text-sm font-semibold text-muted-foreground">Tâches associées</p>
                            {topTasks.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">Aucune donnée</p>
                            ) : topTasks.map((t) => {
                                const c = getComplianceColor(t.complianceRate);
                                return (
                                    <div key={t.taskId} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <span className="text-sm truncate max-w-[160px] font-medium">{t.taskName}</span>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="secondary" className="text-xs tabular-nums">{t.failed} éch.</Badge>
                                            <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{t.complianceRate.toFixed(1)}%</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </ScrollArea>

                <div className="p-4 border-t">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => { onClose(); onSwitchTab(); }}
                    >
                        <ListChecks className="h-4 w-4" />
                        Voir toutes les tâches
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function OverviewTab({ period, thresholds, onSwitchTab }: { period: PeriodKey; thresholds: ComplianceThresholds; onSwitchTab: () => void }) {
    const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
    const dateRange = useDateRange(period);
    const groupBy: 'day' | 'week' = Number(period) > 14 ? 'week' : 'day';
    const { isTvMode } = useUIStore();
    const interval = isTvMode ? 30000 : undefined;

    const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview(dateRange, interval);
    const { data: trend, isLoading: trendLoading } = useAnalyticsTrend({ ...dateRange, groupBy }, interval);
    const { data: byTask } = useAnalyticsByTask({ ...dateRange, limit: 50 }, interval);

    const complianceColors = getComplianceColor(overview?.complianceRate ?? 0, thresholds);

    if (overviewLoading) {
        return (
            <div className="space-y-6">
                <KpiSkeleton />
                <ChartSkeleton />
            </div>
        );
    }

    const total = overview?.total ?? 0;

    return (
        <div className="space-y-6">
            <KpiDetailSheet
                kpiKey={selectedKpi}
                onClose={() => setSelectedKpi(null)}
                overview={overview}
                byTask={byTask}
                onSwitchTab={onSwitchTab}
            />

            {/* KPI grid + compliance */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
                {KPI_CONFIG.map((cfg) => {
                    const Icon = cfg.icon;
                    const value = overview?.[cfg.key] ?? 0;
                    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                    return (
                        <Card
                            key={cfg.key}
                            className="lg:col-span-1 col-span-1 cursor-pointer transition-shadow hover:ring-1 hover:ring-primary"
                            onClick={() => setSelectedKpi(cfg.key)}
                        >
                            <CardHeader className="pb-2 flex flex-row items-start justify-between">
                                <span className="text-sm font-medium text-muted-foreground">{cfg.label}</span>
                                <div className={`rounded-full p-2 ${cfg.iconBg} shrink-0`}>
                                    <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="text-4xl font-bold tracking-tight">{value}</div>
                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.badgeClass}`}>
                                    {pct}% du total
                                </span>
                                <Progress
                                    value={pct}
                                    className={`h-1.5 ${cfg.progressClass}`}
                                />
                            </CardContent>
                        </Card>
                    );
                })}

                {/* Compliance card — spans 2 cols */}
                <Card className="lg:col-span-2 col-span-1 sm:col-span-2 flex flex-col justify-between">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Taux de conformité
                        </CardTitle>
                        <CardDescription className="text-xs">
                            Succès / (Succès + Échecs + Manquants)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className={`text-6xl font-black tracking-tight transition-colors duration-500 ${complianceColors.text}`}>
                            {overview?.complianceRate?.toFixed(1) ?? '—'}
                            <span className="text-3xl font-bold">%</span>
                        </div>
                        <Progress
                            value={overview?.complianceRate ?? 0}
                            className={`h-4 rounded-full ${complianceColors.progress}`}
                        />
                        <div className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${complianceColors.bg} ${complianceColors.text}`}>
                            {(overview?.complianceRate ?? 0) >= thresholds.warningThreshold
                                ? '✓ Objectif atteint'
                                : (overview?.complianceRate ?? 0) >= thresholds.criticalThreshold
                                    ? '⚠ En dessous de l\'objectif'
                                    : '✗ Critique'}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Area chart */}
            {trendLoading ? (
                <ChartSkeleton />
            ) : (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Tendance des statuts</CardTitle>
                        <CardDescription>
                            {groupBy === 'week' ? 'Agrégé par semaine' : 'Par jour'} — {dateRange.startDate} → {dateRange.endDate}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {trend && trend.length > 0 ? (
                            <ResponsiveContainer width="100%" height={280}>
                                <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="gradMissing" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="0" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                                        axisLine={false}
                                        tickLine={false}
                                    />
                                    <RechartsTooltip content={<CustomChartTooltip />} />
                                    <Area type="monotone" dataKey="success" name="Succès" stroke="#22c55e" strokeWidth={2} fill="url(#gradSuccess)" />
                                    <Area type="monotone" dataKey="failed" name="Échecs" stroke="#ef4444" strokeWidth={2} fill="url(#gradFailed)" />
                                    <Area type="monotone" dataKey="missing" name="Manquants" stroke="#f59e0b" strokeWidth={2} fill="url(#gradMissing)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                                <Activity className="h-8 w-8 opacity-30" />
                                <p className="text-sm">Aucune donnée pour cette période.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// By Task Tab
// ─────────────────────────────────────────────────────────

function ByTaskTab({ period, thresholds }: { period: PeriodKey; thresholds: ComplianceThresholds }) {
    const dateRange = useDateRange(period);
    const { data, isLoading } = useAnalyticsByTask({ ...dateRange, limit: 50 });

    const sorted = useMemo(
        () => (data ? [...data].sort((a, b) => a.complianceRate - b.complianceRate) : []),
        [data],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Conformité par tâche</CardTitle>
                <CardDescription>Les pires tâches en premier — limit 50</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <TableSkeleton cols={4} />
                ) : sorted.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                        <ListChecks className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Aucune donnée pour cette période.</p>
                    </div>
                ) : (
                    <ScrollArea className="max-h-[500px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Tâche</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Échecs</TableHead>
                                    <TableHead className="text-right pr-6">Conformité</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sorted.map((item) => {
                                    const colors = getComplianceColor(item.complianceRate, thresholds);
                                    return (
                                        <TableRow key={item.taskId}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <span className={`text-lg leading-none ${colors.text}`}>●</span>
                                                    {item.taskName}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">{item.total}</TableCell>
                                            <TableCell className="text-right">
                                                {item.failed > 0 ? (
                                                    <Badge variant="destructive" className="ml-auto">{item.failed}</Badge>
                                                ) : (
                                                    <Badge variant="secondary" className="ml-auto">0</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="pr-6">
                                                <div className="flex items-center justify-end gap-3">
                                                    <Progress
                                                        value={item.complianceRate}
                                                        className={`h-1.5 w-20 shrink-0 ${colors.progress}`}
                                                    />
                                                    <span className={`text-sm font-semibold tabular-nums w-12 text-right ${colors.text}`}>
                                                        {item.complianceRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}

// ─────────────────────────────────────────────────────────
// By User Tab
// ─────────────────────────────────────────────────────────

function ByUserTab({ period, thresholds }: { period: PeriodKey; thresholds: ComplianceThresholds }) {
    const dateRange = useDateRange(period);
    const { data, isLoading } = useAnalyticsByUser(dateRange);

    const sorted = useMemo(
        () => (data ? [...data].sort((a, b) => a.complianceRate - b.complianceRate) : []),
        [data],
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">Conformité par utilisateur</CardTitle>
                <CardDescription>Les moins performants en premier</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
                {isLoading ? (
                    <TableSkeleton cols={5} />
                ) : sorted.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                        <Users className="h-8 w-8 opacity-30" />
                        <p className="text-sm">Aucune donnée pour cette période.</p>
                    </div>
                ) : (
                    <ScrollArea className="max-h-[500px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="pl-6">Utilisateur</TableHead>
                                    <TableHead className="text-right">Total</TableHead>
                                    <TableHead className="text-right">Succès</TableHead>
                                    <TableHead className="text-right">Échecs</TableHead>
                                    <TableHead className="text-right pr-6">Conformité</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sorted.map((item) => {
                                    const colors = getComplianceColor(item.complianceRate, thresholds);
                                    const initials = getInitials(item.fullname, item.username);
                                    return (
                                        <TableRow key={item.userId}>
                                            <TableCell className="pl-6">
                                                <div className="flex items-center gap-3">
                                                    <Avatar size="sm">
                                                        <AvatarFallback className={`text-xs font-semibold ${colors.bg} ${colors.text}`}>
                                                            {initials}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <div className="font-medium text-sm">{item.fullname || item.username}</div>
                                                        {item.fullname && (
                                                            <div className="text-xs text-muted-foreground">{item.username}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-muted-foreground">{item.total}</TableCell>
                                            <TableCell className="text-right text-emerald-500 font-medium">{item.success}</TableCell>
                                            <TableCell className="text-right">
                                                {item.failed > 0 ? (
                                                    <Badge variant="destructive">{item.failed}</Badge>
                                                ) : (
                                                    <Badge variant="secondary">0</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="pr-6">
                                                <div className="flex items-center justify-end gap-3">
                                                    <Progress
                                                        value={item.complianceRate}
                                                        className={`h-1.5 w-20 shrink-0 ${colors.progress}`}
                                                    />
                                                    <span className={`text-sm font-semibold tabular-nums w-12 text-right ${colors.text}`}>
                                                        {item.complianceRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </ScrollArea>
                )}
            </CardContent>
        </Card>
    );
}

// ─────────────────────────────────────────────────────────
// Reports Tab
// ─────────────────────────────────────────────────────────

function ReportsTab({ period }: { period: PeriodKey }) {
    const dateRange = useDateRange(period);
    const periodLabel = `${dateRange.startDate} → ${dateRange.endDate}`;
    const [isExporting, setIsExporting] = useState<null | 'csv' | 'pdf'>(null);

    const handleExport = async (type: 'csv' | 'pdf') => {
        setIsExporting(type);
        toast.success("Téléchargement démarré");
        try {
            if (type === 'csv') await analyticsApi.exportCsv(dateRange);
            else await analyticsApi.exportPdf(dateRange);
        } catch {
            toast.error("Échec lors du téléchargement");
        } finally {
            setIsExporting(null);
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* CSV */}
            <Card className="bg-muted/30">
                <CardContent className="pt-8 pb-6 flex flex-col items-center text-center gap-4">
                    <div className="rounded-full bg-emerald-500/15 p-4">
                        <FileSpreadsheet className="h-12 w-12 text-emerald-500" />
                    </div>
                    <div>
                        <p className="font-semibold text-lg">Export CSV</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Données brutes pour Excel ou Google Sheets
                        </p>
                    </div>
                    <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
                    <Button
                        onClick={() => handleExport('csv')}
                        disabled={isExporting !== null}
                        className="w-full mt-2"
                    >
                        <Download className="h-4 w-4" />
                        {isExporting === 'csv' ? 'Exportation...' : 'Télécharger CSV'}
                    </Button>
                </CardContent>
            </Card>

            {/* PDF */}
            <Card className="bg-muted/30">
                <CardContent className="pt-8 pb-6 flex flex-col items-center text-center gap-4">
                    <div className="rounded-full bg-red-500/15 p-4">
                        <FileText className="h-12 w-12 text-red-500" />
                    </div>
                    <div>
                        <p className="font-semibold text-lg">Export PDF</p>
                        <p className="text-sm text-muted-foreground mt-1">
                            Rapport prêt à partager avec votre direction
                        </p>
                    </div>
                    <Badge variant="outline" className="text-xs">{periodLabel}</Badge>
                    <Button
                        variant="outline"
                        onClick={() => handleExport('pdf')}
                        disabled={isExporting !== null}
                        className="w-full mt-2"
                    >
                        <Download className="h-4 w-4" />
                        {isExporting === 'pdf' ? 'Exportation...' : 'Télécharger PDF'}
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Summary Dialog
// ─────────────────────────────────────────────────────────

interface SummaryDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    overview: AnalyticsOverview | undefined;
    byTask: AnalyticsByTask[] | undefined;
    dateRange: { startDate: string; endDate: string };
}

function SummaryDialog({ open, onOpenChange, overview, byTask, dateRange }: SummaryDialogProps) {
    const [dialogTab, setDialogTab] = useState('summary');
    const [periodA, setPeriodA] = useState<PeriodKey>('7');
    const [periodB, setPeriodB] = useState<PeriodKey>('30');

    const dateRangeA = useDateRange(periodA);
    const dateRangeB = useDateRange(periodB);
    const { data: overviewA } = useAnalyticsOverview(dateRangeA);
    const { data: overviewB } = useAnalyticsOverview(dateRangeB);

    const [isExporting, setIsExporting] = useState<null | 'csv' | 'pdf'>(null);

    const handleExport = async (type: 'csv' | 'pdf') => {
        setIsExporting(type);
        toast.success("Téléchargement démarré");
        try {
            if (type === 'csv') await analyticsApi.exportCsv(dateRange);
            else await analyticsApi.exportPdf(dateRange);
        } catch {
            toast.error("Échec lors du téléchargement");
        } finally {
            setIsExporting(null);
        }
    };

    const top3 = useMemo(
        () => (byTask ? [...byTask].sort((a, b) => a.complianceRate - b.complianceRate).slice(0, 3) : []),
        [byTask],
    );

    const complianceColors = getComplianceColor(overview?.complianceRate ?? 0);

    const handleCopy = useCallback(() => {
        const rate = overview?.complianceRate?.toFixed(1) ?? '0.0';
        const text = `Taskmaster — ${dateRange.startDate} → ${dateRange.endDate} | Conformité: ${rate}% | Succès: ${overview?.success ?? 0} | Échecs: ${overview?.failed ?? 0} | Manquants: ${overview?.missing ?? 0}`;
        navigator.clipboard.writeText(text).then(() => {
            toast.success('Résumé copié ✓');
        });
    }, [overview, dateRange]);

    const delta = (overviewB?.complianceRate ?? 0) - (overviewA?.complianceRate ?? 0);
    const deltaColors = delta > 0
        ? { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/15' }
        : delta < 0
            ? { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/15' }
            : { text: 'text-muted-foreground', bg: 'bg-muted' };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Synthèse analytique</DialogTitle>
                    <DialogDescription>Vue rapide de vos KPI et comparaison de périodes.</DialogDescription>
                </DialogHeader>

                <Tabs value={dialogTab} onValueChange={setDialogTab}>
                    <TabsList className="h-auto gap-1">
                        <TabsTrigger value="summary" className="gap-1.5 text-xs">
                            <BarChart2 className="h-3.5 w-3.5" />
                            Résumé
                        </TabsTrigger>
                        <TabsTrigger value="compare" className="gap-1.5 text-xs">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            Comparer
                        </TabsTrigger>
                        <TabsTrigger value="export" className="gap-1.5 text-xs">
                            <Package className="h-3.5 w-3.5" />
                            Exporter
                        </TabsTrigger>
                    </TabsList>

                    {/* Summary tab */}
                    <TabsContent value="summary" className="space-y-5 mt-4 min-h-[340px]">
                        <div className="text-center">
                            <div className={`text-5xl font-black tracking-tight transition-colors ${complianceColors.text}`}>
                                {overview?.complianceRate?.toFixed(1) ?? '—'}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Taux de conformité</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: 'Succès', value: overview?.success ?? 0, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
                                { label: 'Échecs', value: overview?.failed ?? 0, cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
                                { label: 'Manquants', value: overview?.missing ?? 0, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
                            ].map((item) => (
                                <div key={item.label} className="text-center">
                                    <div className="text-2xl font-bold">{item.value}</div>
                                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${item.cls}`}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {top3.length > 0 && (
                            <>
                                <Separator />
                                <div>
                                    <p className="text-sm font-semibold mb-2">Top 3 tâches problématiques</p>
                                    <div className="space-y-2">
                                        {top3.map((t, i) => {
                                            const c = getComplianceColor(t.complianceRate);
                                            return (
                                                <div key={t.taskId} className="flex items-center justify-between text-sm">
                                                    <span className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold ${c.text}`}>#{i + 1}</span>
                                                        <span className="truncate max-w-[280px]">{t.taskName}</span>
                                                    </span>
                                                    <span className={`font-semibold tabular-nums ${c.text}`}>
                                                        {t.complianceRate.toFixed(1)}%
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </>
                        )}

                        <Button onClick={handleCopy} variant="outline" className="w-full">
                            <Copy className="h-4 w-4" />
                            Copier le résumé
                        </Button>
                    </TabsContent>

                    {/* Compare tab */}
                    <TabsContent value="compare" className="space-y-5 mt-4 min-h-[340px]">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Period A */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">Période A</Badge>
                                    <Select value={periodA} onValueChange={(v) => setPeriodA(v as PeriodKey)}>
                                        <SelectTrigger className="h-7 w-20 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERIODS.map((p) => (
                                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-center">
                                    <div className={`text-4xl font-black ${getComplianceColor(overviewA?.complianceRate ?? 0).text}`}>
                                        {overviewA?.complianceRate?.toFixed(1) ?? '—'}%
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{dateRangeA.startDate} → {dateRangeA.endDate}</p>
                                </div>
                            </div>

                            {/* Period B */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">Période B</Badge>
                                    <Select value={periodB} onValueChange={(v) => setPeriodB(v as PeriodKey)}>
                                        <SelectTrigger className="h-7 w-20 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERIODS.map((p) => (
                                                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="text-center">
                                    <div className={`text-4xl font-black ${getComplianceColor(overviewB?.complianceRate ?? 0).text}`}>
                                        {overviewB?.complianceRate?.toFixed(1) ?? '—'}%
                                    </div>
                                    <p className="text-xs text-muted-foreground mt-1">{dateRangeB.startDate} → {dateRangeB.endDate}</p>
                                </div>
                            </div>
                        </div>

                        <Separator />

                        <div className="text-center">
                            <p className="text-sm text-muted-foreground mb-2">Variation B vs A</p>
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${deltaColors.bg} ${deltaColors.text}`}>
                                {delta > 0 ? `↑ +${delta.toFixed(1)}` : delta < 0 ? `↓ ${delta.toFixed(1)}` : '='} pts
                            </span>
                        </div>
                    </TabsContent>

                    {/* Export tab */}
                    <TabsContent value="export" className="mt-4 min-h-[340px]">
                        <div className="grid grid-cols-2 gap-4 h-full">
                            {/* CSV */}
                            <button
                                type="button"
                                onClick={() => handleExport('csv')}
                                disabled={isExporting !== null}
                                className={`group flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-border bg-muted/30 p-6 text-center transition-all duration-150 hover:border-emerald-500/50 hover:bg-emerald-500/5 hover:shadow-md cursor-pointer ${isExporting !== null ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <div className="rounded-full bg-emerald-500/15 p-4 transition-transform duration-150 group-hover:scale-110">
                                    <FileSpreadsheet className="h-10 w-10 text-emerald-500" />
                                </div>
                                <div>
                                    <p className="font-semibold text-base">Export CSV</p>
                                    <p className="text-xs text-muted-foreground mt-1">Excel / Google Sheets</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <Download className="h-3 w-3" />
                                    {isExporting === 'csv' ? 'En cours...' : 'Télécharger'}
                                </span>
                            </button>

                            {/* PDF */}
                            <button
                                type="button"
                                onClick={() => handleExport('pdf')}
                                disabled={isExporting !== null}
                                className={`group flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-border bg-muted/30 p-6 text-center transition-all duration-150 hover:border-red-500/50 hover:bg-red-500/5 hover:shadow-md cursor-pointer ${isExporting !== null ? 'opacity-50 pointer-events-none' : ''}`}
                            >
                                <div className="rounded-full bg-red-500/15 p-4 transition-transform duration-150 group-hover:scale-110">
                                    <FileText className="h-10 w-10 text-red-500" />
                                </div>
                                <div>
                                    <p className="font-semibold text-base">Export PDF</p>
                                    <p className="text-xs text-muted-foreground mt-1">Rapport de conformité</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                                    <Download className="h-3 w-3" />
                                    {isExporting === 'pdf' ? 'En cours...' : 'Télécharger'}
                                </span>
                            </button>
                        </div>
                    </TabsContent>
                </Tabs>
            </DialogContent>
        </Dialog >
    );
}

// ─────────────────────────────────────────────────────────
// Threshold Dialog
// ─────────────────────────────────────────────────────────

interface ThresholdDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    thresholds: ComplianceThresholds;
    onSave: (next: ComplianceThresholds) => void;
}

function ThresholdDialog({ open, onOpenChange, thresholds, onSave }: ThresholdDialogProps) {
    const [warning, setWarning] = useState(thresholds.warningThreshold);
    const [critical, setCritical] = useState(thresholds.criticalThreshold);

    const isValid = warning > critical;

    const handleSave = () => {
        if (!isValid) return;
        onSave({ warningThreshold: warning, criticalThreshold: critical });
        onOpenChange(false);
        toast.success('Seuils mis à jour');
    };

    const handleReset = () => {
        setWarning(DEFAULT_THRESHOLDS.warningThreshold);
        setCritical(DEFAULT_THRESHOLDS.criticalThreshold);
    };

    const previewColors = [
        { label: `≥ ${warning}%`, rate: warning, desc: 'OK' },
        { label: `${critical}–${warning - 1}%`, rate: (warning + critical) / 2, desc: 'Attention' },
        { label: `< ${critical}%`, rate: critical - 1, desc: 'Critique' },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>Seuils de conformité</DialogTitle>
                    <DialogDescription>Personnalisez les couleurs de l'indicateur de conformité.</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="threshold-warning">Seuil attention (orange)</Label>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setWarning((v) => Math.max(0, v - 1))}>
                                <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                                id="threshold-warning"
                                type="number"
                                min={0}
                                max={100}
                                value={warning}
                                onChange={(e) => setWarning(Number(e.target.value))}
                                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setWarning((v) => Math.min(100, v + 1))}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="threshold-critical">Seuil critique (rouge)</Label>
                        <div className="flex items-center gap-2">
                            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCritical((v) => Math.max(0, v - 1))}>
                                <Minus className="h-4 w-4" />
                            </Button>
                            <Input
                                id="threshold-critical"
                                type="number"
                                min={0}
                                max={100}
                                value={critical}
                                onChange={(e) => setCritical(Number(e.target.value))}
                                className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => setCritical((v) => Math.min(100, v + 1))}>
                                <Plus className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {!isValid && (
                        <p className="text-sm text-destructive">Le seuil attention doit être supérieur au seuil critique.</p>
                    )}

                    <Separator />

                    <div>
                        <p className="text-xs text-muted-foreground mb-2">Aperçu</p>
                        <div className="flex gap-2">
                            {previewColors.map((p) => {
                                const c = getComplianceColor(p.rate, { warningThreshold: warning, criticalThreshold: critical });
                                return (
                                    <div key={p.label} className="flex-1 text-center">
                                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${c.bg} ${c.text}`}>
                                            {p.desc}
                                        </span>
                                        <p className="text-[10px] text-muted-foreground mt-1">{p.label}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <DialogFooter className="gap-2">
                    <Button variant="ghost" size="sm" onClick={handleReset}>Réinitialiser</Button>
                    <Button size="sm" onClick={handleSave} disabled={!isValid}>Enregistrer</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────

import { cn } from '@/lib/utils';

export function AnalyticsPage() {
    const [period, setPeriod] = useState<PeriodKey>('30');
    const [activeTab, setActiveTab] = useState('overview');
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [isThresholdOpen, setIsThresholdOpen] = useState(false);
    const role = useAuthStore((s) => s.role);
    const isGuest = role === 'GUEST';
    const { thresholds, setThresholds } = useComplianceThresholds();
    const { isTvMode, setIsTvMode } = useUIStore();

    const isManagerOrAbove = role === 'MANAGER' || role === 'SUPER_ADMIN';

    const dateRange = useDateRange(period);
    const { data: overview } = useAnalyticsOverview(dateRange);
    const { data: byTask } = useAnalyticsByTask({ ...dateRange, limit: 50 });

    return (
        <div className="container mx-auto py-6 space-y-6 max-w-6xl">
            {/* Header */}
            <div className={cn("flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4", isTvMode && "hidden")}>
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Analytiques</h1>
                        <p className="text-muted-foreground text-sm mt-0.5">
                            KPI, conformité et rapports opérationnels.
                        </p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-2 ml-4"
                        onClick={() => setIsTvMode(true)}
                    >
                        <Monitor className="h-4 w-4" />
                        Mode TV
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    {/* Pill period toggle */}
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted border border-border">
                        {PERIODS.map((opt) => (
                            <Button
                                key={opt.value}
                                size="sm"
                                variant={period === opt.value ? 'default' : 'ghost'}
                                onClick={() => setPeriod(opt.value)}
                                className="h-7 px-3 text-xs rounded-md"
                            >
                                {opt.label}
                            </Button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setIsSummaryOpen(true)} className="gap-1.5">
                        <BarChart2 className="h-4 w-4" />
                        Synthèse
                    </Button>

                    {!isGuest && (
                        <Button variant="ghost" size="icon" onClick={() => setIsThresholdOpen(true)}>
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

            {isTvMode && (
                <div className="flex items-center justify-between px-6 py-3 bg-muted/30 border rounded-lg">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold flex items-center gap-2 text-primary">
                            <Monitor className="h-4 w-4" />
                            MODE AFFICHAGE TV ANALYTICS {(isGuest) && " (LECTURE SEULE)"}
                        </span>
                        <Badge variant="outline" className="text-xs">Période : {PERIODS.find(p => p.value === period)?.label}</Badge>
                    </div>
                    {!isGuest && (
                        <Button variant="ghost" size="sm" onClick={() => setIsTvMode(false)} className="h-8 gap-2">
                            <X className="h-4 w-4" /> Quitter
                        </Button>
                    )}
                </div>
            )}

            <SummaryDialog
                open={isSummaryOpen}
                onOpenChange={setIsSummaryOpen}
                overview={overview}
                byTask={byTask}
                dateRange={dateRange}
            />

            <ThresholdDialog
                open={isThresholdOpen}
                onOpenChange={setIsThresholdOpen}
                thresholds={thresholds}
                onSave={setThresholds}
            />

            <Separator />

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="h-auto gap-1">
                    <TabsTrigger value="overview" className="gap-2">
                        <LayoutDashboard className="h-4 w-4" />
                        Vue d'ensemble
                    </TabsTrigger>
                    <TabsTrigger value="by-task" className="gap-2">
                        <ListChecks className="h-4 w-4" />
                        Par tâche
                    </TabsTrigger>
                    {isManagerOrAbove && (
                        <TabsTrigger value="by-user" className="gap-2">
                            <Users className="h-4 w-4" />
                            Par utilisateur
                        </TabsTrigger>
                    )}
                    <TabsTrigger value="reports" className="gap-2">
                        <FileDown className="h-4 w-4" />
                        Rapports
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="overview">
                    <OverviewTab period={period} thresholds={thresholds} onSwitchTab={() => setActiveTab('by-task')} />
                </TabsContent>

                <TabsContent value="by-task">
                    <ByTaskTab period={period} thresholds={thresholds} />
                </TabsContent>

                {isManagerOrAbove && (
                    <TabsContent value="by-user">
                        <ByUserTab period={period} thresholds={thresholds} />
                    </TabsContent>
                )}

                <TabsContent value="reports">
                    <ReportsTab period={period} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
