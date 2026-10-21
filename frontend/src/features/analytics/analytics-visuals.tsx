import { useTranslation } from 'react-i18next';
import { CheckCircle2, type LucideIcon } from 'lucide-react';
import {
    Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, XAxis, YAxis,
} from 'recharts';
import { cn } from '@/lib/utils';
import type { AnalyticsByTask, AnalyticsTrendPoint } from '@/api/types';
import {
    LEVEL_STYLES, STATUS_COLORS, getComplianceLevel, type ComplianceLevel, type ComplianceThresholds,
} from './analytics-levels';

export function StatusPill({ level, size = 'sm' }: { level: ComplianceLevel; size?: 'sm' | 'lg' }) {
    const { t } = useTranslation();
    const style = LEVEL_STYLES[level];
    const Icon = style.icon;
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset',
                size === 'lg' ? 'px-4 py-1.5 text-base' : 'px-2.5 py-1 text-xs',
                style.pill,
            )}
        >
            <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-3.5 w-3.5'} />
            {t(`analytics.status.${level}`)}
        </span>
    );
}

/** Circular gauge for the global compliance rate, colored by threshold level. */
export function ComplianceGauge({
    rate, level, size = 168, stroke = 14,
}: { rate: number | undefined; level: ComplianceLevel; size?: number; stroke?: number }) {
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = Math.max(0, Math.min(100, rate ?? 0));
    const offset = circumference - (clamped / 100) * circumference;
    const big = size >= 220;

    return (
        <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
                <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-muted" />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={LEVEL_STYLES[level].color}
                    strokeWidth={stroke}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    className="transition-[stroke-dashoffset] duration-1000 ease-out"
                />
            </svg>
            <div className="absolute inset-0 flex items-baseline justify-center pt-[38%]">
                <span className={cn('font-bold tabular-nums tracking-tight', big ? 'text-6xl' : 'text-4xl')}>
                    {rate === undefined ? '—' : rate.toFixed(1)}
                </span>
                <span className={cn('ml-0.5 font-semibold text-muted-foreground', big ? 'text-2xl' : 'text-lg')}>%</span>
            </div>
        </div>
    );
}

interface DistributionProps {
    success: number;
    failed: number;
    missing: number;
    large?: boolean;
}

/** Share of success / failed / missing executions as one segmented bar with a legend. */
export function DistributionBar({ success, failed, missing, large }: DistributionProps) {
    const { t } = useTranslation();
    const total = success + failed + missing;
    const parts = [
        { key: 'success', value: success, color: STATUS_COLORS.success },
        { key: 'failed', value: failed, color: STATUS_COLORS.failed },
        { key: 'missing', value: missing, color: STATUS_COLORS.missing },
    ] as const;

    return (
        <div className="space-y-3">
            <div className={cn('flex w-full gap-0.5 overflow-hidden rounded-full bg-muted', large ? 'h-4' : 'h-2.5')}>
                {total > 0 && parts.filter((p) => p.value > 0).map((p) => (
                    <div
                        key={p.key}
                        className="h-full first:rounded-l-full last:rounded-r-full transition-[width] duration-700"
                        style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }}
                        title={`${t(`analytics.kpi.${p.key}`)}: ${p.value}`}
                    />
                ))}
            </div>
            <ul className={cn('flex flex-wrap gap-x-5 gap-y-1.5', large ? 'text-base' : 'text-xs')}>
                {parts.map((p) => (
                    <li key={p.key} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden="true" />
                        {t(`analytics.kpi.${p.key}`)}
                        <span className="font-semibold tabular-nums text-foreground">
                            {total > 0 ? Math.round((p.value / total) * 100) : 0}%
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

interface TrendTooltipProps {
    active?: boolean;
    payload?: { name: string; value: number; color: string; dataKey: string }[];
    label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
    const { t } = useTranslation();
    if (!active || !payload?.length) return null;
    const total = payload.reduce((sum, p) => sum + (p.value ?? 0), 0);
    return (
        <div className="min-w-[180px] rounded-xl border bg-popover px-4 py-3 text-sm shadow-lg">
            <p className="mb-2 font-semibold text-foreground">{label}</p>
            {[...payload].reverse().map((entry) => (
                <div key={entry.dataKey} className="flex items-center justify-between gap-4 py-0.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: entry.color }} />
                        {entry.name}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{entry.value}</span>
                </div>
            ))}
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-xs text-muted-foreground">
                <span>{t('analytics.kpi.total')}</span>
                <span className="font-semibold tabular-nums text-foreground">{total}</span>
            </div>
        </div>
    );
}

/** Executions per period, stacked by status. */
export function TrendChart({ data, height = 280, large }: { data: AnalyticsTrendPoint[]; height?: number; large?: boolean }) {
    const { t } = useTranslation();
    const tick = { fontSize: large ? 15 : 11, fill: 'var(--muted-foreground)' };
    const series = [
        { key: 'success', color: STATUS_COLORS.success },
        { key: 'missing', color: STATUS_COLORS.missing },
        { key: 'failed', color: STATUS_COLORS.failed },
    ] as const;

    return (
        <div>
            <ResponsiveContainer width="100%" height={height}>
                <BarChart data={data} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke="var(--border)" strokeOpacity={0.6} vertical={false} />
                    <XAxis dataKey="date" tick={tick} axisLine={false} tickLine={false} tickMargin={8} minTickGap={12} />
                    <YAxis tick={tick} axisLine={false} tickLine={false} allowDecimals={false} width={large ? 48 : 40} />
                    <RechartsTooltip content={<TrendTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.5 }} />
                    {series.map((s, i) => (
                        <Bar
                            key={s.key}
                            dataKey={s.key}
                            name={t(`analytics.kpi.${s.key}`)}
                            stackId="status"
                            fill={s.color}
                            stroke="var(--card)"
                            strokeWidth={1}
                            maxBarSize={large ? 64 : 44}
                            radius={i === series.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                            isAnimationActive={false}
                        />
                    ))}
                </BarChart>
            </ResponsiveContainer>
            <ul className={cn('mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1', large ? 'text-base' : 'text-xs')}>
                {series.map((s) => (
                    <li key={s.key} className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
                        {t(`analytics.kpi.${s.key}`)}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** The tasks with the lowest compliance, as labelled horizontal bars. */
export function AttentionList({
    tasks, thresholds, limit = 5, large,
}: { tasks: AnalyticsByTask[] | undefined; thresholds: ComplianceThresholds; limit?: number; large?: boolean }) {
    const { t } = useTranslation();
    const worst = (tasks ?? [])
        .filter((task) => task.total > 0 && task.complianceRate < thresholds.warningThreshold)
        .sort((a, b) => a.complianceRate - b.complianceRate)
        .slice(0, limit);

    if (worst.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
                    <CheckCircle2 className="h-6 w-6" />
                </span>
                <p className={cn('text-muted-foreground', large ? 'text-lg' : 'text-sm')}>{t('analytics.attention.empty')}</p>
            </div>
        );
    }

    return (
        <ul className={cn(large ? 'space-y-5' : 'space-y-4')}>
            {worst.map((task) => {
                const level = getComplianceLevel(task.complianceRate, thresholds);
                const style = LEVEL_STYLES[level];
                const Icon = style.icon;
                return (
                    <li key={task.taskId} className="space-y-1.5">
                        <div className={cn('flex items-center justify-between gap-3', large ? 'text-lg' : 'text-sm')}>
                            <span className="flex min-w-0 items-center gap-2">
                                <Icon className={cn('shrink-0', style.text, large ? 'h-5 w-5' : 'h-4 w-4')} aria-label={t(`analytics.status.${level}`)} />
                                <span className="truncate font-medium">{task.taskName}</span>
                            </span>
                            <span className="shrink-0 tabular-nums">
                                <span className="font-semibold">{task.complianceRate.toFixed(0)}%</span>
                                <span className="ml-2 text-muted-foreground">
                                    {t('analytics.failShort', { n: task.failed + task.missing })}
                                </span>
                            </span>
                        </div>
                        <div className={cn('overflow-hidden rounded-full bg-muted', large ? 'h-2.5' : 'h-1.5')}>
                            <div
                                className="h-full rounded-full transition-[width] duration-700"
                                style={{ width: `${Math.max(2, task.complianceRate)}%`, backgroundColor: style.color }}
                            />
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

export function EmptyState({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
    return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-muted-foreground">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                <Icon className="h-6 w-6 opacity-60" />
            </span>
            <p className="text-sm">{text}</p>
        </div>
    );
}
