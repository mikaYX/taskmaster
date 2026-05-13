
import { useState } from 'react';
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
    const [isLoading, setIsLoading] = useState(false);

    const handleRun = async () => {
        setIsLoading(true);
        try {
            await backupApi.createSystem(type);
            toast.success(type === 'DB' ? t('backupModal.startedDatabase') : t('backupModal.startedFullSystem'));
            onOpenChange(false);
            onSuccess();
        } catch (e) {
            console.error(e);
            toast.error(t('backupModal.startFailed'));
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
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
                        onValueChange={(v) => !canRunFull ? undefined : setType(v as 'DB' | 'FULL')}
                    >
                        <div className={`flex items-start space-x-3 border rounded-lg p-3 ${!canRunFull ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer hover:bg-muted/50'} ${type === 'DB' && canRunFull ? 'border-primary ring-1 ring-primary' : ''}`}>
                            <RadioGroupItem value="DB" id="type-db" className="mt-1" disabled={!canRunFull} />
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
                            <RadioGroupItem value="FULL" id="type-full" className="mt-1" disabled={!canRunFull} />
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

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
                    <Button onClick={handleRun} disabled={isLoading || !canRunFull}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('backupModal.runBackup')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
