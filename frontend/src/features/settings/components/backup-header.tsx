import { Server, CalendarClock, History } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { getDateLocale } from '@/lib/date-locale';
import { cn } from '@/lib/utils';

interface BackupHeaderProps {
    status?: {
        lastBackupAt: Date | null;
        lastBackupStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | null;
        storagePath: string;
        nextRunAt?: Date | null;
    };
    isLoading: boolean;
}

const STATUS_TONE: Record<string, string> = {
    SUCCESS: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    FAILED: 'bg-red-500/10 text-red-700 dark:text-red-400',
    PENDING: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
};

export function BackupHeader({ status, isLoading }: BackupHeaderProps) {
    const { t } = useTranslation();
    const locale = getDateLocale();

    if (isLoading) return <div className="h-28 animate-pulse rounded-xl bg-muted" />;

    const lastRun = status?.lastBackupAt ? format(new Date(status.lastBackupAt), 'PP p', { locale }) : t('backupHeader.never');
    const nextRun = status?.nextRunAt ? format(new Date(status.nextRunAt), 'PP p', { locale }) : t('backupHeader.automaticBackupsDisabled');
    const statusLabel = status?.lastBackupStatus
        ? t(`backupHeader.status.${status.lastBackupStatus.toLowerCase()}`)
        : t('backupHeader.status.noData');

    const tile = 'flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm';

    return (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className={tile}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-700 dark:text-cyan-400">
                    <History className="h-5 w-5" />
                </span>
                <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('backupHeader.lastBackup')}</p>
                    <p className="font-semibold leading-tight">{lastRun}</p>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_TONE[status?.lastBackupStatus ?? ''] ?? 'bg-muted text-muted-foreground')}>
                        {statusLabel}
                    </span>
                </div>
            </div>

            <div className={tile}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400">
                    <CalendarClock className="h-5 w-5" />
                </span>
                <div className="min-w-0 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('backupHeader.nextRun')}</p>
                    <p className="font-semibold leading-tight">{nextRun}</p>
                    <p className="text-[11px] text-muted-foreground">{t('backupHeader.serverTimezone')}</p>
                </div>
            </div>

            <div className={cn(tile, 'md:col-span-2')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/10 text-slate-700 dark:text-slate-300">
                    <Server className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">{t('backupHeader.storageLocation')}</p>
                    <code className="block truncate rounded-md bg-muted px-2 py-1 font-mono text-sm">
                        {status?.storagePath || '/var/lib/taskmaster/backups'}
                    </code>
                    <p className="text-[11px] text-muted-foreground">
                        {t('backupHeader.configuredVia')} <code>BACKUP_STORAGE_PATH</code> {t('backupHeader.environmentVariable')}
                    </p>
                </div>
            </div>
        </div>
    );
}
