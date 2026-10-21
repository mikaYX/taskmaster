import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, BarChart3, CheckCircle2, Monitor, RefreshCw, X, XCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAnalyticsByTask, useAnalyticsOverview, useAnalyticsTrend } from '@/hooks/use-analytics';
import { AttentionList, ComplianceGauge, DistributionBar, EmptyState, StatusPill, TrendChart } from './analytics-visuals';
import { STATUS_COLORS, getComplianceLevel, type ComplianceThresholds } from './analytics-levels';

const REFRESH_MS = 30_000;

interface AnalyticsTvProps {
    dateRange: { startDate: string; endDate: string };
    periodLabel: string;
    groupBy: 'day' | 'week';
    thresholds: ComplianceThresholds;
    canExit: boolean;
    onExit: () => void;
}

function useClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 1000);
        return () => window.clearInterval(id);
    }, []);
    return now;
}

/** Wall-screen layout: large type, no tabs, auto-refresh every 30 seconds. */
export function AnalyticsTv({ dateRange, periodLabel, groupBy, thresholds, canExit, onExit }: AnalyticsTvProps) {
    const { t, i18n } = useTranslation();
    const now = useClock();

    const { data: overview, isLoading, dataUpdatedAt } = useAnalyticsOverview(dateRange, REFRESH_MS);
    const { data: trend } = useAnalyticsTrend({ ...dateRange, groupBy }, REFRESH_MS);
    const { data: byTask } = useAnalyticsByTask({ ...dateRange, limit: 50 }, REFRESH_MS);

    const level = getComplianceLevel(overview?.complianceRate ?? 0, thresholds);
    const locale = i18n.language;
    const updatedAt = dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : '—';

    const kpis = [
        { key: 'success', icon: CheckCircle2, color: STATUS_COLORS.success, value: overview?.success },
        { key: 'failed', icon: XCircle, color: STATUS_COLORS.failed, value: overview?.failed },
        { key: 'missing', icon: AlertTriangle, color: STATUS_COLORS.missing, value: overview?.missing },
        { key: 'total', icon: Activity, color: 'var(--primary)', value: overview?.total },
    ] as const;

    return (
        <div className="flex min-h-full flex-col gap-5 bg-muted/30 p-6">
            {/* Header */}
            <header className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
                        <BarChart3 className="h-7 w-7" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">{t('analytics.title')}</h1>
                        <p className="text-base text-muted-foreground">
                            {t('analytics.periodBadge', { period: periodLabel })} · {dateRange.startDate} → {dateRange.endDate}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-4xl font-semibold tabular-nums tracking-tight">
                            {now.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-sm capitalize text-muted-foreground">
                            {now.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                    </div>
                    {canExit && (
                        <Button variant="outline" size="lg" onClick={onExit} className="gap-2">
                            <X className="h-5 w-5" />
                            {t('analytics.exit')}
                        </Button>
                    )}
                </div>
            </header>

            {isLoading ? (
                <div className="grid flex-1 gap-6 xl:grid-cols-3">
                    <Skeleton className="h-[420px] rounded-3xl" />
                    <Skeleton className="h-[420px] rounded-3xl xl:col-span-2" />
                </div>
            ) : (
                <>
                    {/* Hero + KPIs */}
                    <div className="grid gap-6 xl:grid-cols-3">
                        <section className="flex flex-col items-center justify-center gap-4 rounded-3xl border bg-card p-6 shadow-sm">
                            <p className="text-lg font-medium text-muted-foreground">{t('analytics.complianceRate')}</p>
                            <ComplianceGauge rate={overview?.complianceRate} level={level} size={230} stroke={18} />
                            <StatusPill level={level} size="lg" />
                        </section>

                        <section className="grid grid-cols-2 gap-6 xl:col-span-2">
                            {kpis.map(({ key, icon: Icon, color, value }) => (
                                <div key={key} className="relative flex flex-col justify-between overflow-hidden rounded-3xl border bg-card p-6 shadow-sm">
                                    <span className="absolute inset-x-0 top-0 h-1.5" style={{ backgroundColor: color }} aria-hidden="true" />
                                    <div className="flex items-center justify-between">
                                        <p className="text-xl font-medium text-muted-foreground">{t(`analytics.kpi.${key}`)}</p>
                                        <Icon className="h-8 w-8" style={{ color }} />
                                    </div>
                                    <p className="mt-3 text-6xl font-bold tabular-nums tracking-tight">{value ?? 0}</p>
                                </div>
                            ))}
                        </section>
                    </div>

                    {/* Trend + attention */}
                    <div className="grid flex-1 gap-6 xl:grid-cols-3">
                        <section className="rounded-3xl border bg-card p-7 shadow-sm xl:col-span-2">
                            <div className="mb-5 flex items-baseline justify-between gap-4">
                                <h2 className="text-2xl font-semibold">{t('analytics.trendTitle')}</h2>
                                <span className="text-base text-muted-foreground">
                                    {groupBy === 'week' ? t('analytics.byWeek') : t('analytics.byDay')}
                                </span>
                            </div>
                            {trend && trend.length > 0 ? (
                                <TrendChart data={trend} height={350} large />
                            ) : (
                                <EmptyState icon={Activity} text={t('analytics.noDataPeriod')} />
                            )}
                        </section>

                        <section className="flex flex-col gap-6 rounded-3xl border bg-card p-6 shadow-sm">
                            <div>
                                <h2 className="text-2xl font-semibold">{t('analytics.attention.title')}</h2>
                                <p className="mt-1 text-base text-muted-foreground">{t('analytics.attention.description')}</p>
                            </div>
                            <AttentionList tasks={byTask} thresholds={thresholds} limit={6} large />
                            <div className="mt-auto border-t pt-5">
                                <DistributionBar
                                    success={overview?.success ?? 0}
                                    failed={overview?.failed ?? 0}
                                    missing={overview?.missing ?? 0}
                                    large
                                />
                            </div>
                        </section>
                    </div>
                </>
            )}

            {/* Footer */}
            <footer className={cn('flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground')}>
                <span className="flex items-center gap-2">
                    <Monitor className="h-4 w-4" />
                    {t('analytics.tvBanner')} {!canExit && t('analytics.readOnly')}
                </span>
                <span className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('analytics.tv.autoRefresh')} · {t('analytics.tv.updatedAt', { time: updatedAt })}
                </span>
            </footer>
        </div>
    );
}
