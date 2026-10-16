
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, Database, FolderArchive } from 'lucide-react';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface ManualBackupModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    canRunFull: boolean; // False if encryption key missing — disables all backup types
}

export function ManualBackupModal({ open, onOpenChange, onSuccess, canRunFull }: ManualBackupModalProps) {
    const { t } = useTranslation();
    const [type, setType] = useState<'DB' | 'FULL'>('DB');
    const [isStarting, setIsStarting] = useState(false);
    const [jobId, setJobId] = useState<string | null>(null);
    const notifiedJob = useRef<string | null>(null);
    const job = useQuery({
        queryKey: ['backup-job', jobId],
        queryFn: () => backupApi.getJobStatus(jobId!),
        enabled: jobId !== null,
        refetchInterval: query => ['completed', 'failed'].includes(query.state.data?.state ?? '') ? false : 2000,
        refetchIntervalInBackground: true,
        retry: 2,
    });
    const terminal = job.data?.state === 'completed' || job.data?.state === 'failed';
    const isLoading = isStarting || (jobId !== null && !terminal && !job.isError);

    useEffect(() => {
        if (!jobId || !terminal || notifiedJob.current === jobId) return;
        notifiedJob.current = jobId;
        if (job.data?.state === 'completed') {
            toast.success(t('backupModal.completed'));
            onSuccess();
            onOpenChange(false);
        } else {
            toast.error(t('backupModal.failed'));
        }
    }, [jobId, terminal, job.data?.state, onSuccess, onOpenChange, t]);

    const handleRun = async () => {
        if (isLoading) return;
        setIsStarting(true);
        setJobId(null);
        try {
            const result = await backupApi.createSystem(type);
            setJobId(result.jobId);
        } catch (e) {
            console.error(e);
            toast.error(t('backupModal.startFailed'));
        } finally {
            setIsStarting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={value => { if (!isLoading) onOpenChange(value); }}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('backupModal.title')}</DialogTitle>
                    <DialogDescription>
                        {t('backupModal.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    <RadioGroup
                        value={type}
                        onValueChange={(v) => !canRunFull || isLoading ? undefined : setType(v as 'DB' | 'FULL')}
                    >
                        <div className={`flex items-start space-x-3 border rounded-lg p-3 ${!canRunFull ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer hover:bg-muted/50'} ${type === 'DB' && canRunFull ? 'border-primary ring-1 ring-primary' : ''}`}>
                            <RadioGroupItem value="DB" id="type-db" className="mt-1" disabled={!canRunFull || isLoading} />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="type-db" className={`font-semibold flex items-center gap-2 ${!canRunFull ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <Database className="h-4 w-4" /> {t('backupModal.databaseOnly')}
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {t('backupModal.databaseDescription')}
                                </p>
                            </div>
                        </div>

                        <div className={`flex items-start space-x-3 border rounded-lg p-3 ${!canRunFull ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer hover:bg-muted/50'} ${type === 'FULL' && canRunFull ? 'border-primary ring-1 ring-primary' : ''}`}>
                            <RadioGroupItem value="FULL" id="type-full" className="mt-1" disabled={!canRunFull || isLoading} />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="type-full" className={`font-semibold flex items-center gap-2 ${!canRunFull ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <FolderArchive className="h-4 w-4" /> {t('backupModal.systemSnapshot')}
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {t('backupModal.systemDescription')}
                                    <br />
                                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400">{t('backupModal.requiresEncryptionKey')}</span>
                                </p>
                            </div>
                        </div>
                    </RadioGroup>

                    {!canRunFull && (
                        <p className="text-xs text-destructive text-center bg-destructive/10 p-2 rounded">
                            {t('backupModal.disabledMissingKey')}
                        </p>
                    )}
                </div>

                {isLoading && <p role="status" className="text-sm text-muted-foreground">{t('backupModal.running')}</p>}
                {job.data?.state === 'failed' && <p role="alert" className="text-sm text-destructive break-words">{t('backupModal.failed')}{job.data.error ? ` : ${job.data.error}` : ''}</p>}
                {job.isError && <p role="alert" className="text-sm text-destructive">{t('backupModal.monitorFailed')}</p>}
                <DialogFooter>
                    <Button variant="outline" disabled={isLoading} onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleRun} disabled={isLoading || !canRunFull}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('backupModal.runBackup')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
