/** Soft colour per periodicity, shared by the task list and the task pages. */
export const PERIODICITY_TONE: Record<string, string> = {
    daily: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
    weekly: 'bg-violet-500/10 text-violet-700 dark:text-violet-400',
    monthly: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    yearly: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    custom: 'bg-primary/10 text-primary',
};

export const periodicityTone = (periodicity: string | null | undefined) =>
    PERIODICITY_TONE[(periodicity || 'daily').toLowerCase()] ?? PERIODICITY_TONE.custom;
