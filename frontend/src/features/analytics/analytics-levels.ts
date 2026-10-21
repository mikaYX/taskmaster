import { AlertTriangle, CheckCircle2, XCircle, type LucideIcon } from 'lucide-react';

/**
 * Status colors (good / warning / critical). They are reserved for execution
 * states and always ship with an icon + label, never as the only cue.
 */
export const STATUS_COLORS = {
    success: '#0ca30c',
    missing: '#fab219',
    failed: '#d03b3b',
} as const;

export interface ComplianceThresholds {
    warningThreshold: number;
    criticalThreshold: number;
}

export const DEFAULT_THRESHOLDS: ComplianceThresholds = { warningThreshold: 70, criticalThreshold: 50 };

export type ComplianceLevel = 'good' | 'warning' | 'critical';

export function getComplianceLevel(rate: number, t: ComplianceThresholds = DEFAULT_THRESHOLDS): ComplianceLevel {
    if (rate >= t.warningThreshold) return 'good';
    if (rate >= t.criticalThreshold) return 'warning';
    return 'critical';
}

export const LEVEL_STYLES: Record<ComplianceLevel, {
    color: string;
    icon: LucideIcon;
    pill: string;
    soft: string;
    text: string;
    progress: string;
}> = {
    good: {
        color: STATUS_COLORS.success,
        icon: CheckCircle2,
        pill: 'bg-emerald-500/12 text-emerald-700 ring-emerald-600/20 dark:text-emerald-300',
        soft: 'bg-emerald-500/10',
        text: 'text-emerald-700 dark:text-emerald-400',
        progress: '[&>[data-slot=progress-indicator]]:bg-[#0ca30c]',
    },
    warning: {
        color: STATUS_COLORS.missing,
        icon: AlertTriangle,
        pill: 'bg-amber-400/15 text-amber-800 ring-amber-500/25 dark:text-amber-300',
        soft: 'bg-amber-400/10',
        text: 'text-amber-700 dark:text-amber-400',
        progress: '[&>[data-slot=progress-indicator]]:bg-[#fab219]',
    },
    critical: {
        color: STATUS_COLORS.failed,
        icon: XCircle,
        pill: 'bg-red-500/12 text-red-700 ring-red-600/20 dark:text-red-300',
        soft: 'bg-red-500/10',
        text: 'text-red-700 dark:text-red-400',
        progress: '[&>[data-slot=progress-indicator]]:bg-[#d03b3b]',
    },
};
