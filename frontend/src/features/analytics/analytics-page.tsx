import { useState, useMemo, useCallback } from 'react';
import {
    LayoutDashboard, ListChecks, Users, FileDown,
    CheckCircle2, XCircle, AlertTriangle, Activity, Download,
    FileSpreadsheet, FileText, BarChart2, BarChart3, Copy, Package, ArrowUpDown, Settings2, Plus, Minus,
    Monitor, Search, ChevronRight,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

import { useAuthStore } from '@/stores/auth-store';
import {
    useAnalyticsOverview,
    useAnalyticsTrend,
    useAnalyticsByTask,
    useAnalyticsByUser,
} from '@/hooks/use-analytics';
import { analyticsApi } from '@/api/analytics';
import type { AnalyticsOverview, AnalyticsByTask } from '@/api/types';
import {
    AttentionList, ComplianceGauge, DistributionBar, EmptyState, StatusPill, TrendChart,
} from './analytics-visuals';
import {
    DEFAULT_THRESHOLDS, LEVEL_STYLES, STATUS_COLORS, getComplianceLevel, type ComplianceThresholds,
} from './analytics-levels';
import { AnalyticsTv } from './analytics-tv';

export type { ComplianceThresholds } from './analytics-levels';

// ─────────────────────────────────────────────────────────
// Types & constants
// ─────────────────────────────────────────────────────────

type PeriodKey = '1' | '7' | '30' | '90';
type KpiKey = 'success' | 'failed' | 'missing' | 'total';

const THRESHOLDS_KEY = 'analytics.thresholds';

const PERIOD_VALUES: PeriodKey[] = ['1', '7', '30', '90'];

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
    const style = LEVEL_STYLES[getComplianceLevel(rate, t)];
    return { text: style.text, bg: style.soft, progress: style.progress };
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

const panel = 'rounded-2xl border bg-card shadow-sm';

function Panel({ title, description, action, children, className }: {
    title?: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
    return (
        <section className={cn(panel, 'p-5 sm:p-6', className)}>
            {(title || action) && (
                <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                    <div>
                        {title && <h2 className="text-base font-semibold">{title}</h2>}
                        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
                    </div>
                    {action}
                </div>
            )}
            {children}
        </section>
    );
}

// ─────────────────────────────────────────────────────────
// Skeletons
// ─────────────────────────────────────────────────────────

function OverviewSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid gap-4 lg:grid-cols-12">
                <Skeleton className="h-[300px] rounded-2xl lg:col-span-5" />
                <div className="grid grid-cols-2 gap-4 lg:col-span-7">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[142px] rounded-2xl" />)}
                </div>
            </div>
            <Skeleton className="h-[360px] rounded-2xl" />
        </div>
    );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
    return (
        <div className="space-y-3">
            {Array.from({ length: rows }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
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
        icon: CheckCircle2,
        color: STATUS_COLORS.success,
        iconBg: 'bg-emerald-500/12',
        iconColor: 'text-emerald-600 dark:text-emerald-400',
        badgeClass: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    },
    {
        key: 'failed' as const,
        icon: XCircle,
        color: STATUS_COLORS.failed,
        iconBg: 'bg-red-500/12',
        iconColor: 'text-red-600 dark:text-red-400',
        badgeClass: 'bg-red-500/15 text-red-700 dark:text-red-300',
    },
    {
        key: 'missing' as const,
        icon: AlertTriangle,
        color: STATUS_COLORS.missing,
        iconBg: 'bg-amber-400/15',
        iconColor: 'text-amber-600 dark:text-amber-400',
        badgeClass: 'bg-amber-400/20 text-amber-800 dark:text-amber-300',
    },
    {
        key: 'total' as const,
        icon: Activity,
        color: 'var(--primary)',
        iconBg: 'bg-primary/10',
        iconColor: 'text-primary',
        badgeClass: 'bg-primary/10 text-primary',
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
    const { t } = useTranslation();
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
                        {t(`analytics.kpi.${cfg.key}`)}
                        <Badge className={cfg.badgeClass}>{value}</Badge>
                    </SheetTitle>
                </SheetHeader>

                <ScrollArea className="flex-1 p-6">
                    {kpiKey === 'total' ? (
                        <div className="space-y-5">
                            <p className="text-sm font-semibold text-muted-foreground">{t('analytics.breakdown')}</p>
                            {[
                                { label: t('analytics.kpi.success'), value: overview?.success ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-emerald-500', text: 'text-emerald-500' },
                                { label: t('analytics.kpi.failed'), value: overview?.failed ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-red-500', text: 'text-red-500' },
                                { label: t('analytics.kpi.missing'), value: overview?.missing ?? 0, cls: '[&>[data-slot=progress-indicator]]:bg-amber-500', text: 'text-amber-500' },
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
                            <p className="text-sm font-semibold text-muted-foreground">{t('analytics.top10')}</p>
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
                            <p className="text-sm font-semibold text-muted-foreground">{t('analytics.relatedTasks')}</p>
                            {topTasks.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-8 text-center">{t('analytics.noData')}</p>
                            ) : topTasks.map((task) => {
                                const c = getComplianceColor(task.complianceRate);
                                return (
                                    <div key={task.taskId} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <span className="text-sm truncate max-w-[160px] font-medium">{task.taskName}</span>
                                        <div className="flex items-center gap-3">
                                            <Badge variant="secondary" className="text-xs tabular-nums">{t('analytics.failShort', { n: task.failed })}</Badge>
                                            <span className={`text-xs font-semibold tabular-nums ${c.text}`}>{task.complianceRate.toFixed(1)}%</span>
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
                        {t('analytics.viewAllTasks')}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function OverviewTab({ period, thresholds, onSwitchTab }: { period: PeriodKey; thresholds: ComplianceThresholds; onSwitchTab: () => void }) {
    const { t } = useTranslation();
    const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
    const dateRange = useDateRange(period);
    const groupBy: 'day' | 'week' = Number(period) > 14 ? 'week' : 'day';

    const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview(dateRange);
    const { data: trend, isLoading: trendLoading } = useAnalyticsTrend({ ...dateRange, groupBy });
    const { data: byTask } = useAnalyticsByTask({ ...dateRange, limit: 50 });

    if (overviewLoading) return <OverviewSkeleton />;

    const total = overview?.total ?? 0;
    const level = getComplianceLevel(overview?.complianceRate ?? 0, thresholds);

    return (
        <div className="space-y-6">
            <KpiDetailSheet
                kpiKey={selectedKpi}
                onClose={() => setSelectedKpi(null)}
                overview={overview}
                byTask={byTask}
                onSwitchTab={onSwitchTab}
            />

            <div className="grid gap-4 lg:grid-cols-12">
                {/* Compliance hero */}
                <section className={cn(panel, 'relative overflow-hidden p-6 lg:col-span-5')}>
                    <div
                        className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-[0.12] blur-2xl"
                        style={{ backgroundColor: LEVEL_STYLES[level].color }}
                        aria-hidden="true"
                    />
                    <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
                        <ComplianceGauge rate={overview?.complianceRate} level={level} />
                        <div className="flex flex-1 flex-col items-center gap-3 text-center sm:items-start sm:text-left">
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">{t('analytics.complianceRate')}</p>
                                <p className="mt-0.5 text-xs text-muted-foreground/80">{t('analytics.complianceFormula')}</p>
                            </div>
                            <StatusPill level={level} />
                            <p className="text-xs text-muted-foreground">
                                {t('analytics.goal', { pct: thresholds.warningThreshold })}
                            </p>
                        </div>
                    </div>
                    <div className="relative mt-6 border-t pt-5">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {t('analytics.distribution')}
                        </p>
                        <DistributionBar
                            success={overview?.success ?? 0}
                            failed={overview?.failed ?? 0}
                            missing={overview?.missing ?? 0}
                        />
                    </div>
                </section>

                {/* KPI tiles */}
                <div className="grid grid-cols-2 gap-4 lg:col-span-7">
                    {KPI_CONFIG.map((cfg) => {
                        const Icon = cfg.icon;
                        const value = overview?.[cfg.key] ?? 0;
                        const pct = total > 0 ? Math.round((value / total) * 100) : 0;
                        return (
                            <button
                                key={cfg.key}
                                type="button"
                                onClick={() => setSelectedKpi(cfg.key)}
                                className={cn(
                                    panel,
                                    'group relative flex flex-col justify-between overflow-hidden p-5 text-left transition-all',
                                    'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                )}
                            >
                                <span className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: cfg.color }} aria-hidden="true" />
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-muted-foreground">{t(`analytics.kpi.${cfg.key}`)}</span>
                                    <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', cfg.iconBg)}>
                                        <Icon className={cn('h-[18px] w-[18px]', cfg.iconColor)} />
                                    </span>
                                </div>
                                <div className="mt-4 flex items-end justify-between gap-2">
                                    <span className="text-3xl font-bold tabular-nums tracking-tight sm:text-4xl">{value}</span>
                                    {cfg.key !== 'total' ? (
                                        <span className="mb-1 text-xs font-medium text-muted-foreground">
                                            {t('analytics.pctOfTotal', { pct })}
                                        </span>
                                    ) : (
                                        <ChevronRight className="mb-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                                    )}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-12">
                {/* Trend */}
                <Panel
                    className="lg:col-span-8"
                    title={t('analytics.trendTitle')}
                    description={`${groupBy === 'week' ? t('analytics.byWeek') : t('analytics.byDay')} · ${dateRange.startDate} → ${dateRange.endDate}`}
                >
                    {trendLoading ? (
                        <Skeleton className="h-[280px] w-full rounded-xl" />
                    ) : trend && trend.length > 0 ? (
                        <TrendChart data={trend} />
                    ) : (
                        <EmptyState icon={Activity} text={t('analytics.noDataPeriod')} />
                    )}
                </Panel>

                {/* Needs attention */}
                <Panel
                    className="lg:col-span-4"
                    title={t('analytics.attention.title')}
                    description={t('analytics.attention.description')}
                >
                    <AttentionList tasks={byTask} thresholds={thresholds} />
                    {byTask && byTask.length > 0 && (
                        <Button variant="ghost" size="sm" className="mt-4 w-full gap-1.5" onClick={onSwitchTab}>
                            {t('analytics.viewAllTasks')}
                            <ChevronRight className="h-4 w-4" />
                        </Button>
                    )}
                </Panel>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────
// Ranking rows (by task / by user)
// ─────────────────────────────────────────────────────────

function RateCell({ rate, thresholds }: { rate: number; thresholds: ComplianceThresholds }) {
    const { t } = useTranslation();
    const level = getComplianceLevel(rate, thresholds);
    const style = LEVEL_STYLES[level];
    const Icon = style.icon;
    return (
        <div className="flex w-full items-center gap-3 sm:w-56">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(2, rate)}%`, backgroundColor: style.color }} />
            </div>
            <span className="flex w-16 shrink-0 items-center justify-end gap-1 text-sm font-semibold tabular-nums">
                <Icon className={cn('h-3.5 w-3.5', style.text)} aria-label={t(`analytics.status.${level}`)} />
                {rate.toFixed(1)}%
            </span>
        </div>
    );
}

function CountChip({ value, tone }: { value: number; tone: 'failed' | 'success' | 'neutral' }) {
    return (
        <span
            className={cn(
                'inline-flex min-w-8 justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums',
                tone === 'failed' && value > 0 && 'bg-red-500/12 text-red-700 dark:text-red-300',
                tone === 'success' && 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
                (tone === 'neutral' || (tone === 'failed' && value === 0)) && 'bg-muted text-muted-foreground',
            )}
        >
            {value}
        </span>
    );
}

// ─────────────────────────────────────────────────────────
// By Task Tab
// ─────────────────────────────────────────────────────────

function ByTaskTab({ period, thresholds }: { period: PeriodKey; thresholds: ComplianceThresholds }) {
    const { t } = useTranslation();
    const dateRange = useDateRange(period);
    const { data, isLoading } = useAnalyticsByTask({ ...dateRange, limit: 50 });
    const [query, setQuery] = useState('');

    const sorted = useMemo(() => {
        const q = query.trim().toLowerCase();
        return (data ?? [])
            .filter((item) => !q || item.taskName.toLowerCase().includes(q))
            .sort((a, b) => a.complianceRate - b.complianceRate);
    }, [data, query]);

    return (
        <Panel
            title={t('analytics.byTask.title')}
            description={t('analytics.byTask.description')}
            action={
                <div className="relative w-full sm:w-64">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('analytics.searchTask')}
                        className="h-9 rounded-xl pl-9"
                    />
                </div>
            }
        >
            {isLoading ? (
                <TableSkeleton />
            ) : sorted.length === 0 ? (
                <EmptyState icon={ListChecks} text={t('analytics.noDataPeriod')} />
            ) : (
                <div className="overflow-hidden rounded-xl border">
                    <div className="hidden grid-cols-[1fr_5rem_5rem_14rem] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:grid">
                        <span>{t('analytics.byTask.task')}</span>
                        <span className="text-center">{t('analytics.kpi.total')}</span>
                        <span className="text-center">{t('analytics.kpi.failed')}</span>
                        <span className="text-right">{t('analytics.byTask.compliance')}</span>
                    </div>
                    <ScrollArea className="max-h-[560px]">
                        <ul className="divide-y">
                            {sorted.map((item) => (
                                <li key={item.taskId} className="grid gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:grid-cols-[1fr_5rem_5rem_14rem] sm:items-center sm:gap-4">
                                    <span className="truncate text-sm font-medium">{item.taskName}</span>
                                    <span className="text-sm tabular-nums text-muted-foreground sm:text-center">
                                        <span className="sm:hidden">{t('analytics.kpi.total')}: </span>{item.total}
                                    </span>
                                    <span className="sm:text-center"><CountChip value={item.failed} tone="failed" /></span>
                                    <span className="sm:flex sm:justify-end"><RateCell rate={item.complianceRate} thresholds={thresholds} /></span>
                                </li>
                            ))}
                        </ul>
                    </ScrollArea>
                </div>
            )}
        </Panel>
    );
}

// ─────────────────────────────────────────────────────────
// By User Tab
// ─────────────────────────────────────────────────────────

function ByUserTab({ period, thresholds }: { period: PeriodKey; thresholds: ComplianceThresholds }) {
    const { t } = useTranslation();
    const dateRange = useDateRange(period);
    const { data, isLoading } = useAnalyticsByUser(dateRange);

    const sorted = useMemo(
        () => (data ? [...data].sort((a, b) => a.complianceRate - b.complianceRate) : []),
        [data],
    );

    return (
        <Panel title={t('analytics.byUser.title')} description={t('analytics.byUser.description')}>
            {isLoading ? (
                <TableSkeleton />
            ) : sorted.length === 0 ? (
                <EmptyState icon={Users} text={t('analytics.noDataPeriod')} />
            ) : (
                <div className="overflow-hidden rounded-xl border">
                    <div className="hidden grid-cols-[1fr_4.5rem_4.5rem_4.5rem_14rem] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
                        <span>{t('analytics.byUser.user')}</span>
                        <span className="text-center">{t('analytics.kpi.total')}</span>
                        <span className="text-center">{t('analytics.kpi.success')}</span>
                        <span className="text-center">{t('analytics.kpi.failed')}</span>
                        <span className="text-right">{t('analytics.byTask.compliance')}</span>
                    </div>
                    <ScrollArea className="max-h-[560px]">
                        <ul className="divide-y">
                            {sorted.map((item) => {
                                const colors = getComplianceColor(item.complianceRate, thresholds);
                                return (
                                    <li key={item.userId} className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/30 md:grid-cols-[1fr_4.5rem_4.5rem_4.5rem_14rem] md:items-center md:gap-4">
                                        <div className="flex min-w-0 items-center gap-3">
                                            <Avatar size="sm">
                                                <AvatarFallback className={cn('text-xs font-semibold', colors.bg, colors.text)}>
                                                    {getInitials(item.fullname, item.username)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <div className="truncate text-sm font-medium">{item.fullname || item.username}</div>
                                                {item.fullname && <div className="truncate text-xs text-muted-foreground">{item.username}</div>}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 md:contents">
                                            <span className="text-center text-sm tabular-nums text-muted-foreground">{item.total}</span>
                                            <span className="text-center"><CountChip value={item.success} tone="success" /></span>
                                            <span className="text-center"><CountChip value={item.failed} tone="failed" /></span>
                                        </div>
                                        <span className="md:flex md:justify-end"><RateCell rate={item.complianceRate} thresholds={thresholds} /></span>
                                    </li>
                                );
                            })}
                        </ul>
                    </ScrollArea>
                </div>
            )}
        </Panel>
    );
}

// ─────────────────────────────────────────────────────────
// Reports Tab
// ─────────────────────────────────────────────────────────

function ReportsTab({ period }: { period: PeriodKey }) {
    const { t } = useTranslation();
    const dateRange = useDateRange(period);
    const periodLabel = `${dateRange.startDate} → ${dateRange.endDate}`;
    const [isExporting, setIsExporting] = useState<null | 'csv' | 'pdf'>(null);

    const handleExport = async (type: 'csv' | 'pdf') => {
        setIsExporting(type);
        toast.success(t('analytics.reports.started'));
        try {
            if (type === 'csv') await analyticsApi.exportCsv(dateRange);
            else await analyticsApi.exportPdf(dateRange);
        } catch {
            toast.error(t('analytics.reports.failed'));
        } finally {
            setIsExporting(null);
        }
    };

    const reports = [
        {
            type: 'csv' as const, icon: FileSpreadsheet, tile: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
            title: t('analytics.reports.csvTitle'), description: t('analytics.reports.csvDescription'), cta: t('analytics.reports.downloadCsv'),
        },
        {
            type: 'pdf' as const, icon: FileText, tile: 'bg-red-500/12 text-red-600 dark:text-red-400',
            title: t('analytics.reports.pdfTitle'), description: t('analytics.reports.pdfDescription'), cta: t('analytics.reports.downloadPdf'),
        },
    ];

    return (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {reports.map((r) => {
                const Icon = r.icon;
                return (
                    <section key={r.type} className={cn(panel, 'flex flex-col gap-5 p-6')}>
                        <div className="flex items-start gap-4">
                            <span className={cn('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', r.tile)}>
                                <Icon className="h-7 w-7" />
                            </span>
                            <div>
                                <h3 className="text-lg font-semibold">{r.title}</h3>
                                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
                            </div>
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                            <Badge variant="outline" className="rounded-lg font-normal">{periodLabel}</Badge>
                            <Button
                                variant={r.type === 'csv' ? 'default' : 'outline'}
                                onClick={() => handleExport(r.type)}
                                disabled={isExporting !== null}
                                className="gap-2"
                            >
                                <Download className="h-4 w-4" />
                                {isExporting === r.type ? t('analytics.reports.exporting') : r.cta}
                            </Button>
                        </div>
                    </section>
                );
            })}
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
    const { t } = useTranslation();
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
        toast.success(t('analytics.reports.started'));
        try {
            if (type === 'csv') await analyticsApi.exportCsv(dateRange);
            else await analyticsApi.exportPdf(dateRange);
        } catch {
            toast.error(t('analytics.reports.failed'));
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
        const text = t('analytics.summaryDialog.copyText', {
            start: dateRange.startDate,
            end: dateRange.endDate,
            rate,
            success: overview?.success ?? 0,
            failed: overview?.failed ?? 0,
            missing: overview?.missing ?? 0,
        });
        navigator.clipboard.writeText(text).then(() => {
            toast.success(t('analytics.summaryDialog.copied'));
        });
    }, [overview, dateRange, t]);

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
                    <DialogTitle>{t('analytics.summaryDialog.title')}</DialogTitle>
                    <DialogDescription>{t('analytics.summaryDialog.description')}</DialogDescription>
                </DialogHeader>

                <Tabs value={dialogTab} onValueChange={setDialogTab}>
                    <TabsList className="h-auto gap-1">
                        <TabsTrigger value="summary" className="gap-1.5 text-xs">
                            <BarChart2 className="h-3.5 w-3.5" />
                            {t('analytics.summaryDialog.tabs.summary')}
                        </TabsTrigger>
                        <TabsTrigger value="compare" className="gap-1.5 text-xs">
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            {t('analytics.summaryDialog.tabs.compare')}
                        </TabsTrigger>
                        <TabsTrigger value="export" className="gap-1.5 text-xs">
                            <Package className="h-3.5 w-3.5" />
                            {t('analytics.summaryDialog.tabs.export')}
                        </TabsTrigger>
                    </TabsList>

                    {/* Summary tab */}
                    <TabsContent value="summary" className="space-y-5 mt-4 min-h-[340px]">
                        <div className="text-center">
                            <div className={`text-5xl font-black tracking-tight transition-colors ${complianceColors.text}`}>
                                {overview?.complianceRate?.toFixed(1) ?? '—'}%
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{t('analytics.complianceRate')}</p>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: t('analytics.kpi.success'), value: overview?.success ?? 0, cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
                                { label: t('analytics.kpi.failed'), value: overview?.failed ?? 0, cls: 'bg-red-500/15 text-red-600 dark:text-red-400' },
                                { label: t('analytics.kpi.missing'), value: overview?.missing ?? 0, cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
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
                                    <p className="text-sm font-semibold mb-2">{t('analytics.summaryDialog.top3')}</p>
                                    <div className="space-y-2">
                                        {top3.map((task, i) => {
                                            const c = getComplianceColor(task.complianceRate);
                                            return (
                                                <div key={task.taskId} className="flex items-center justify-between text-sm">
                                                    <span className="flex items-center gap-2">
                                                        <span className={`text-xs font-bold ${c.text}`}>#{i + 1}</span>
                                                        <span className="truncate max-w-[280px]">{task.taskName}</span>
                                                    </span>
                                                    <span className={`font-semibold tabular-nums ${c.text}`}>
                                                        {task.complianceRate.toFixed(1)}%
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
                            {t('analytics.summaryDialog.copy')}
                        </Button>
                    </TabsContent>

                    {/* Compare tab */}
                    <TabsContent value="compare" className="space-y-5 mt-4 min-h-[340px]">
                        <div className="grid grid-cols-2 gap-4">
                            {/* Period A */}
                            <div className="space-y-3">
                                <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="text-xs">{t('analytics.summaryDialog.periodA')}</Badge>
                                    <Select value={periodA} onValueChange={(v) => setPeriodA(v as PeriodKey)}>
                                        <SelectTrigger className="h-7 w-20 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERIOD_VALUES.map((value) => (
                                                <SelectItem key={value} value={value}>{t(`analytics.periods.${value}`)}</SelectItem>
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
                                    <Badge variant="outline" className="text-xs">{t('analytics.summaryDialog.periodB')}</Badge>
                                    <Select value={periodB} onValueChange={(v) => setPeriodB(v as PeriodKey)}>
                                        <SelectTrigger className="h-7 w-20 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {PERIOD_VALUES.map((value) => (
                                                <SelectItem key={value} value={value}>{t(`analytics.periods.${value}`)}</SelectItem>
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
                            <p className="text-sm text-muted-foreground mb-2">{t('analytics.summaryDialog.variation')}</p>
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-bold ${deltaColors.bg} ${deltaColors.text}`}>
                                {delta > 0 ? `↑ +${delta.toFixed(1)}` : delta < 0 ? `↓ ${delta.toFixed(1)}` : '='} {t('analytics.summaryDialog.pts')}
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
                                    <p className="font-semibold text-base">{t('analytics.reports.csvTitle')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('analytics.summaryDialog.csvSub')}</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                    <Download className="h-3 w-3" />
                                    {isExporting === 'csv' ? t('analytics.summaryDialog.inProgress') : t('analytics.summaryDialog.download')}
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
                                    <p className="font-semibold text-base">{t('analytics.reports.pdfTitle')}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{t('analytics.summaryDialog.pdfSub')}</p>
                                </div>
                                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/15 px-3 py-1 text-xs font-semibold text-red-600 dark:text-red-400">
                                    <Download className="h-3 w-3" />
                                    {isExporting === 'pdf' ? t('analytics.summaryDialog.inProgress') : t('analytics.summaryDialog.download')}
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
    const { t } = useTranslation();
    const [warning, setWarning] = useState(thresholds.warningThreshold);
    const [critical, setCritical] = useState(thresholds.criticalThreshold);

    const isValid = warning > critical;

    const handleSave = () => {
        if (!isValid) return;
        onSave({ warningThreshold: warning, criticalThreshold: critical });
        onOpenChange(false);
        toast.success(t('analytics.thresholds.updated'));
    };

    const handleReset = () => {
        setWarning(DEFAULT_THRESHOLDS.warningThreshold);
        setCritical(DEFAULT_THRESHOLDS.criticalThreshold);
    };

    const previewColors = [
        { label: `≥ ${warning}%`, rate: warning, desc: t('analytics.thresholds.ok') },
        { label: `${critical}–${warning - 1}%`, rate: (warning + critical) / 2, desc: t('analytics.thresholds.attention') },
        { label: `< ${critical}%`, rate: critical - 1, desc: t('analytics.thresholds.criticalLabel') },
    ];

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>{t('analytics.thresholds.title')}</DialogTitle>
                    <DialogDescription>{t('analytics.thresholds.description')}</DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="threshold-warning">{t('analytics.thresholds.warning')}</Label>
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
                        <Label htmlFor="threshold-critical">{t('analytics.thresholds.critical')}</Label>
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
                        <p className="text-sm text-destructive">{t('analytics.thresholds.invalid')}</p>
                    )}

                    <Separator />

                    <div>
                        <p className="text-xs text-muted-foreground mb-2">{t('analytics.thresholds.preview')}</p>
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
                    <Button variant="ghost" size="sm" onClick={handleReset}>{t('analytics.thresholds.reset')}</Button>
                    <Button size="sm" onClick={handleSave} disabled={!isValid}>{t('common.save')}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

// ─────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────

export function AnalyticsPage() {
    const { t } = useTranslation();
    const periodOptions = PERIOD_VALUES.map((value) => ({ value, label: t(`analytics.periods.${value}`) }));
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

    const periodLabel = periodOptions.find((p) => p.value === period)?.label ?? '';

    if (isTvMode) {
        return (
            <AnalyticsTv
                dateRange={dateRange}
                periodLabel={periodLabel}
                groupBy={Number(period) > 14 ? 'week' : 'day'}
                thresholds={thresholds}
                canExit={!isGuest}
                onExit={() => setIsTvMode(false)}
            />
        );
    }

    const tabs = [
        { value: 'overview', icon: LayoutDashboard, label: t('analytics.tabs.overview'), show: true },
        { value: 'by-task', icon: ListChecks, label: t('analytics.tabs.byTask'), show: true },
        { value: 'by-user', icon: Users, label: t('analytics.tabs.byUser'), show: isManagerOrAbove },
        // Reports offer exports and comparisons: not for a wall screen.
        { value: 'reports', icon: FileDown, label: t('analytics.tabs.reports'), show: !isGuest },
    ].filter((tab) => tab.show);

    return (
        <div className="mx-auto w-full max-w-[1200px] space-y-6 pb-24 pt-4 sm:pt-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <BarChart3 className="h-6 w-6" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">{t('analytics.title')}</h1>
                        <p className="text-sm text-muted-foreground">{t('analytics.subtitle')}</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-0.5 rounded-xl border bg-card p-1 shadow-sm" role="radiogroup" aria-label={t('analytics.periodBadge', { period: '' })}>
                        {periodOptions.map((opt) => (
                            <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={period === opt.value}
                                onClick={() => setPeriod(opt.value)}
                                className={cn(
                                    'h-8 rounded-lg px-3 text-xs font-medium transition-colors',
                                    period === opt.value
                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                                )}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>

                    <Button variant="outline" size="sm" onClick={() => setIsSummaryOpen(true)} className="h-10 gap-2 rounded-xl">
                        <BarChart2 className="h-4 w-4" />
                        {t('analytics.summary')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsTvMode(true)} className="h-10 gap-2 rounded-xl">
                        <Monitor className="h-4 w-4" />
                        {t('analytics.tvMode')}
                    </Button>
                    {!isGuest && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-xl"
                            onClick={() => setIsThresholdOpen(true)}
                            aria-label={t('analytics.thresholds.title')}
                        >
                            <Settings2 className="h-4 w-4" />
                        </Button>
                    )}
                </div>
            </div>

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

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl border bg-card p-1 shadow-sm sm:w-fit">
                    {tabs.map(({ value, icon: Icon, label }) => (
                        <TabsTrigger
                            key={value}
                            value={value}
                            className="flex-none gap-2 rounded-lg px-3.5 py-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none"
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </TabsTrigger>
                    ))}
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

                {!isGuest && (
                    <TabsContent value="reports">
                        <ReportsTab period={period} />
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
