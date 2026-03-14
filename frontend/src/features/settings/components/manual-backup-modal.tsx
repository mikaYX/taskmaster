
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Loader2, Database, FolderArchive } from 'lucide-react';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';

interface ManualBackupModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
    canRunFull: boolean; // False if encryption key missing — disables all backup types
}

export function ManualBackupModal({ open, onOpenChange, onSuccess, canRunFull }: ManualBackupModalProps) {
    const [type, setType] = useState<'DB' | 'FULL'>('DB');
    const [isLoading, setIsLoading] = useState(false);

    const handleRun = async () => {
        setIsLoading(true);
        try {
            await backupApi.createSystem(type);
            toast.success(`${type === 'DB' ? 'Database' : 'Full System'} backup started successfully`);
            onOpenChange(false);
            onSuccess();
        } catch (e) {
            console.error(e);
            toast.error('Failed to start backup');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Run Manual Backup</DialogTitle>
                    <DialogDescription>
                        Trigger an immediate backup. This will be saved to the server history.
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
                                    <Database className="h-4 w-4" /> Database Only
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Fast. Includes all application data and users.
                                </p>
                            </div>
                        </div>

                        <div className={`flex items-start space-x-3 border rounded-lg p-3 ${!canRunFull ? 'opacity-50 cursor-not-allowed bg-muted' : 'cursor-pointer hover:bg-muted/50'} ${type === 'FULL' && canRunFull ? 'border-primary ring-1 ring-primary' : ''}`}>
                            <RadioGroupItem value="FULL" id="type-full" className="mt-1" disabled={!canRunFull} />
                            <div className="grid gap-1.5 leading-none">
                                <Label htmlFor="type-full" className={`font-semibold flex items-center gap-2 ${!canRunFull ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                                    <FolderArchive className="h-4 w-4" /> System Snapshot
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    Includes Database + Config + Uploaded Files + Secrets.
                                    <br />
                                    <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Requires Encryption Key.</span>
                                </p>
                            </div>
                        </div>
                    </RadioGroup>

                    {!canRunFull && (
                        <p className="text-xs text-destructive text-center bg-destructive/10 p-2 rounded">
                            Backups are disabled because BACKUP_ENCRYPTION_KEY is missing.
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleRun} disabled={isLoading || !canRunFull}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Run Backup
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
