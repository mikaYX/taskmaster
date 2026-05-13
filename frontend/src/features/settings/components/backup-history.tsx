
import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, Trash2, Database, FolderArchive, Lock, Loader2, Play, UploadCloud, RefreshCw, RotateCcw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { backupApi } from '@/api/backup';
import type { BackupFile } from '@/api/backup';
import { toast } from 'sonner';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ManualBackupModal } from './manual-backup-modal';
import { ImportBackupModal } from './import-backup-modal';
import { useTranslation } from 'react-i18next';

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface BackupHistoryTableProps {
    backups: BackupFile[];
    onRefresh: () => void;
    canRunFull: boolean;
    isDirty: boolean;
    onRestore?: (backup: BackupFile) => void;
}

export function BackupHistoryTable({ backups, onRefresh, canRunFull, isDirty, onRestore }: BackupHistoryTableProps) {
    const { t } = useTranslation();
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [showManualModal, setShowManualModal] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [backupToDelete, setBackupToDelete] = useState<string | null>(null);

    const handleDeleteClick = (filename: string) => {
        setBackupToDelete(filename);
    };

    const confirmDelete = async (filename: string) => {
        setProcessingId(filename);
        setBackupToDelete(null); // Close modal efficiently
        try {
            await backupApi.delete(filename);
            toast.success(t('backupHistory.deleted'));
            onRefresh();
        } catch (e) {
            console.error(e);
            toast.error(t('backupHistory.deleteError'));
        } finally {
            setProcessingId(null);
        }
    };

    const handleDownload = async (filename: string) => {
        try {
            toast.promise(
                async () => {
                    const response = await backupApi.download(filename);

                    let blob: Blob;
                    if (response instanceof Blob) {
                        blob = response;
                    } else if ((response as any).data instanceof Blob) {
                        blob = (response as any).data;
                    } else {
                        throw new Error(t('backupHistory.invalidDownloadResponse'));
                    }

                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = filename;
                    document.body.appendChild(a);
                    a.click();
                    window.URL.revokeObjectURL(url);
                    document.body.removeChild(a);
                },
                {
                    loading: t('backupHistory.preparingDownload'),
                    success: t('backupHistory.downloadStarted'),
                    error: (e) => t('backupHistory.failedToDownload', { error: e.message || t('backupHistory.unknownError') })
                }
            );
        } catch (e) {
            console.error('Download error', e);
            toast.error(t('backupHistory.couldNotStartDownload'));
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{t('backupHistory.title', { count: backups?.length || 0 })}</CardTitle>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                        <UploadCloud className="mr-2 h-4 w-4" /> {t('backupHistory.import')}
                    </Button>
                    <Button size="sm" onClick={() => {
                        if (isDirty) {
                            toast.warning(t('backupHistory.saveConfigurationFirst'));
                            return;
                        }
                        setShowManualModal(true);
                    }}>
                        <Play className="mr-2 h-4 w-4" /> {t('backupHistory.runNow')}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onRefresh} title={t('backupHistory.refreshList')}>
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>{t('backupHistory.columns.type')}</TableHead>
                                <TableHead>{t('backupHistory.columns.filename')}</TableHead>
                                <TableHead>{t('backupHistory.columns.size')}</TableHead>
                                <TableHead>{t('backupHistory.columns.created')}</TableHead>
                                <TableHead className="text-right">{t('backupHistory.columns.actions')}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!backups || backups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Database className="h-8 w-8 opacity-20 mb-2" />
                                            <p className="font-medium">{t('backupHistory.emptyTitle')}</p>
                                            <p className="text-xs">{t('backupHistory.emptyDescription')}</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                backups.map((backup) => {
                                    const isFull = backup.filename.includes('_FULL') || backup.filename.endsWith('.tar.gz.enc');
                                    const isEncrypted = backup.filename.endsWith('.enc');

                                    return (
                                        <TableRow key={backup.filename}>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {isFull ? <FolderArchive className="h-4 w-4 text-blue-500" /> : <Database className="h-4 w-4 text-orange-500" />}
                                                    <span className="font-medium">{isFull ? t('backupHistory.types.system') : t('backupHistory.types.database')}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-mono truncate max-w-[200px]" title={backup.filename}>
                                                        {backup.filename}
                                                    </span>
                                                    {isEncrypted && (
                                                        <Badge variant="outline" className="w-fit text-[10px] h-5 gap-1 px-1">
                                                            <Lock className="h-3 w-3" /> {t('backupHistory.encrypted')}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>{(backup.size / 1024 / 1024).toFixed(2)} MB</TableCell>
                                            <TableCell title={new Date(backup.createdAt).toLocaleString()}>
                                                {formatDistanceToNow(new Date(backup.createdAt), { addSuffix: true })}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-1">
                                                    {onRestore && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => onRestore(backup)}
                                                            title={t('backupHistory.restoreThisBackup')}
                                                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                                                        >
                                                            <RotateCcw className="h-4 w-4 mr-1" />
                                                            {t('backupHistory.restore')}
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDownload(backup.filename)}
                                                        title={t('backupHistory.download')}
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        disabled={processingId === backup.filename}
                                                        onClick={() => handleDeleteClick(backup.filename)}
                                                        title={t('backupHistory.delete')}
                                                    >
                                                        {processingId === backup.filename ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            <Trash2 className="h-4 w-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </div>
            </CardContent>

            <ManualBackupModal
                open={showManualModal}
                onOpenChange={setShowManualModal}
                onSuccess={onRefresh}
                canRunFull={canRunFull}
            />

            <ImportBackupModal
                open={showImportModal}
                onOpenChange={setShowImportModal}
                onSuccess={onRefresh}
            />

            <AlertDialog open={!!backupToDelete} onOpenChange={(open) => !open && setBackupToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('backupHistory.deleteConfirmTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('backupHistory.deleteConfirmDescription', { filename: backupToDelete ?? '' })}<br />
                            {t('backupHistory.deleteConfirmIrreversible')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => backupToDelete && confirmDelete(backupToDelete)}
                        >
                            {t('common.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
