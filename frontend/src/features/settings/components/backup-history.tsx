
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
            toast.success('Backup supprimé');
            onRefresh();
        } catch (e) {
            console.error(e);
            toast.error('Erreur lors de la suppression');
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
                        throw new Error('Invalid download response');
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
                    loading: 'Preparing download...',
                    success: 'Download started',
                    error: (e) => 'Failed to download: ' + (e.message || 'Unknown error')
                }
            );
        } catch (e) {
            console.error('Download error', e);
            toast.error('Could not start download');
        }
    };

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>System Backups ({backups?.length || 0})</CardTitle>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowImportModal(true)}>
                        <UploadCloud className="mr-2 h-4 w-4" /> Import
                    </Button>
                    <Button size="sm" onClick={() => {
                        if (isDirty) {
                            toast.warning('Please save your configuration changes before running a backup.');
                            return;
                        }
                        setShowManualModal(true);
                    }}>
                        <Play className="mr-2 h-4 w-4" /> Run Now
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onRefresh} title="Refresh List">
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Filename</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {!backups || backups.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                                        <div className="flex flex-col items-center gap-2">
                                            <Database className="h-8 w-8 opacity-20 mb-2" />
                                            <p className="font-medium">Aucun backup trouvé</p>
                                            <p className="text-xs">Lancez un backup manuel ou vérifiez votre configuration de stockage.</p>
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
                                                    <span className="font-medium">{isFull ? 'System' : 'Database'}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="text-sm font-mono truncate max-w-[200px]" title={backup.filename}>
                                                        {backup.filename}
                                                    </span>
                                                    {isEncrypted && (
                                                        <Badge variant="outline" className="w-fit text-[10px] h-5 gap-1 px-1">
                                                            <Lock className="h-3 w-3" /> Encrypted
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
                                                            title="Restore this backup"
                                                            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950"
                                                        >
                                                            <RotateCcw className="h-4 w-4 mr-1" />
                                                            Restore
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDownload(backup.filename)}
                                                        title="Download"
                                                    >
                                                        <Download className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="text-destructive hover:text-destructive"
                                                        disabled={processingId === backup.filename}
                                                        onClick={() => handleDeleteClick(backup.filename)}
                                                        title="Delete"
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
                        <AlertDialogTitle>Confirmer la suppression</AlertDialogTitle>
                        <AlertDialogDescription>
                            Êtes-vous sûr de vouloir supprimer la sauvegarde <strong>{backupToDelete}</strong> ?<br />
                            Cette action est irréversible.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => backupToDelete && confirmDelete(backupToDelete)}
                        >
                            Supprimer
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
