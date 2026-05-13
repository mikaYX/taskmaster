
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Server, CalendarClock, History } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface BackupHeaderProps {
    status?: {
        lastBackupAt: Date | null;
        lastBackupStatus: 'SUCCESS' | 'FAILED' | 'PENDING' | null;
        storagePath: string;
        nextRunAt?: Date | null;
    };
    isLoading: boolean;
}

export function BackupHeader({ status, isLoading }: BackupHeaderProps) {
    const { t } = useTranslation();

    if (isLoading) return <div className="h-24 bg-muted animate-pulse rounded-xl" />;

    const lastRun = status?.lastBackupAt ? format(new Date(status.lastBackupAt), 'PP p') : t('backupHeader.never');
    const nextRun = status?.nextRunAt ? format(new Date(status.nextRunAt), 'PP p') : t('backupHeader.automaticBackupsDisabled');
    const statusLabel = status?.lastBackupStatus
        ? t(`backupHeader.status.${status.lastBackupStatus.toLowerCase()}`)
        : t('backupHeader.status.noData');

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
                <CardContent className="p-6 flex flex-row items-center justify-between space-y-0">
                    <div className="space-y-1">
                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <History className="h-4 w-4" /> {t('backupHeader.lastBackup')}
                        </span>
                        <div className="text-2xl font-bold">{lastRun}</div>
                        <Badge variant={status?.lastBackupStatus === 'SUCCESS' ? 'default' : 'destructive'} className="mt-1">
                            {statusLabel}
                        </Badge>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="p-6 flex flex-row items-center justify-between space-y-0">
                    <div className="space-y-1">
                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <CalendarClock className="h-4 w-4" /> {t('backupHeader.nextRun')}
                        </span>
                        <div className="text-lg font-bold leading-tight pt-1">{nextRun}</div>
                        <p className="text-xs text-muted-foreground pt-1">{t('backupHeader.serverTimezone')}</p>
                    </div>
                </CardContent>
            </Card>

            <Card className="md:col-span-2">
                <CardContent className="p-6 flex flex-row items-center justify-between space-y-0">
                    <div className="space-y-1 w-full">
                        <span className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                            <Server className="h-4 w-4" /> {t('backupHeader.storageLocation')}
                        </span>
                        <div className="flex items-center gap-2 pt-1">
                            <code className="bg-muted px-2 py-1 rounded text-sm w-full font-mono block truncate">
                                {status?.storagePath || '/var/lib/taskmaster/backups'}
                            </code>
                        </div>
                        <p className="text-xs text-muted-foreground pt-1">
                            {t('backupHeader.configuredVia')} <code className="text-xs">BACKUP_STORAGE_PATH</code> {t('backupHeader.environmentVariable')}
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
