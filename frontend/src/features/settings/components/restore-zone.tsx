
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TriangleAlert, Upload, Loader2, ShieldCheck, KeyRound, X, Database, FolderArchive, Lock } from 'lucide-react';
import type { BackupFile } from '@/api/backup';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export interface RestoreZoneRef {
    scrollIntoView: () => void;
}

interface RestoreZoneProps {
    selectedBackup: BackupFile | null;
    onSelectBackup: (backup: BackupFile | null) => void;
    backups: BackupFile[];
    onRefreshBackups: () => void;
}

export const RestoreZone = forwardRef<RestoreZoneRef, RestoreZoneProps>(
    ({ selectedBackup, onSelectBackup, backups }, ref) => {
        const containerRef = useRef<HTMLDivElement>(null);
        const fileInputRef = useRef<HTMLInputElement>(null);

        // Expose scroll method to parent
        useImperativeHandle(ref, () => ({
            scrollIntoView: () => {
                containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }));

        // States
        const [validating, setValidating] = useState(false);
        const [validationResult, setValidationResult] = useState<{
            isValid: boolean;
            needsDecryptionKey: boolean;
            manifest?: any;
            error?: string;
            details?: string;
            // For external files
            tempFilename?: string;
        } | null>(null);

        // Restore execution
        const [decryptionKey, setDecryptionKey] = useState('');
        const [isRestoring, setIsRestoring] = useState(false);
        const [showConfirmDialog, setShowConfirmDialog] = useState(false);
        const [confirmInput, setConfirmInput] = useState('');

        // Picker modal
        const [showPickerModal, setShowPickerModal] = useState(false);

        // Validate when backup changes
        useEffect(() => {
            if (selectedBackup) {
                validateBackup(selectedBackup.filename);
                setDecryptionKey('');
            } else {
                setValidationResult(null);
            }
        }, [selectedBackup]);

        const validateBackup = async (filename: string) => {
            setValidating(true);
            setValidationResult(null);

            try {
                const result = await backupApi.validate(filename);
                setValidationResult(result);

                if (result.needsDecryptionKey) {
                    toast.warning("Ce backup nécessite une clé de déchiffrement.");
                }
            } catch (error: any) {
                setValidationResult({
                    isValid: false,
                    needsDecryptionKey: false,
                    error: error.data?.message || error.message || "Erreur de validation"
                });
            } finally {
                setValidating(false);
            }
        };

        const handleRestoreExternalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // Deselect generic server backup if any
            onSelectBackup(null);
            setValidating(true);
            setValidationResult(null);

            try {
                // Pre-flight check (Validate External)
                const result = await backupApi.validateExternal(file);

                if (!result.isValid && !result.needsDecryptionKey) {
                    // Check specifically if it failed basic validation (not just encryption)
                    throw new Error(result.error || "Fichier invalide");
                }

                setValidationResult(result);

                // If valid (or needs key), we show the validation UI
                if (result.isValid || result.needsDecryptionKey) {
                    toast.success("Fichier analysé avec succès. Prêt à restaurer.");
                } else {
                    toast.error(result.error || "Fichier invalide");
                }

            } catch (error: any) {
                setValidationResult({
                    isValid: false,
                    needsDecryptionKey: false,
                    error: error.data?.message || error.message || "Échec de l'analyse du fichier"
                });
                toast.error("Fichier externe refusé");
            } finally {
                setValidating(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };

        const handleRestore = async () => {
            // Can be Server Backup OR External Backup
            const isExternal = !!validationResult?.tempFilename;
            const target = isExternal ? validationResult.tempFilename! : selectedBackup?.filename;

            if (!target) return;

            setIsRestoring(true);
            try {
                // Send key only if needed (OR if user provided one for external)
                // For external, we might always send it if provided, or only if needsDecryptionKey is true.
                // The backend decrypt logic will fail if key is empty and it needs one.
                const keyToSend = decryptionKey || undefined;

                await backupApi.restore(
                    target,
                    keyToSend,
                    undefined,
                    isExternal ? 'temp' : 'backup',
                ); // force not implemented in UI yet but flow allows it

                toast.success('Système restauré. Redirection...');
                setShowConfirmDialog(false);

                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } catch (error: any) {
                console.error('Restore error:', error);
                const msg = error.data?.error || error.data?.message || error.message || 'Échec de la restauration.';
                toast.error(msg);
                setIsRestoring(false);
            }
        };

        const formatDate = (dateStr: string) => {
            try {
                return new Intl.DateTimeFormat('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short'
                }).format(new Date(dateStr));
            } catch {
                return dateStr;
            }
        };

        const formatSize = (bytes: number) => (bytes / 1024 / 1024).toFixed(2) + ' MB';

        const getBackupType = (filename: string) => {
            const isFull = filename.includes('_FULL') || filename.endsWith('.tar.gz.enc');
            return isFull ? 'Système' : 'Base de données';
        };

        const isEncrypted = (filename: string) => filename.endsWith('.enc');

        // Derived state for UI
        const isExternalMode = !!validationResult?.tempFilename;
        const currentBackupName = isExternalMode
            ? "Fichier Externe (Temporaire)"
            : selectedBackup?.filename;

        // Show validation UI if we have a result OR we are selecting a server backup
        const showValidationUI = validationResult || (selectedBackup && !validating);

        return (
            <Card ref={containerRef} className="border-destructive/30 bg-destructive/5 dark:bg-destructive/5">
                <CardHeader>
                    <div className="flex items-center gap-2 text-destructive dark:text-red-400">
                        <TriangleAlert className="h-5 w-5" />
                        <CardTitle>Zone de Danger : Restauration Système</CardTitle>
                    </div>
                    <CardDescription>
                        Restaurez le système depuis une sauvegarde. <br />
                        <strong>Cette action est irréversible et remplacera toutes les données actuelles.</strong>
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Selected Backup Display / Validation Results */}
                    {showValidationUI ? (
                        <div className="bg-background border rounded-lg p-4 space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    {isExternalMode ? (
                                        <Upload className="h-8 w-8 text-purple-500 mt-1" />
                                    ) : (
                                        getBackupType(currentBackupName!) === 'Système' ? (
                                            <FolderArchive className="h-8 w-8 text-blue-500 mt-1" />
                                        ) : (
                                            <Database className="h-8 w-8 text-orange-500 mt-1" />
                                        )
                                    )}
                                    <div>
                                        <h4 className="font-semibold">
                                            {isExternalMode ? "Archive Externe" : "Sauvegarde Sélectionnée"}
                                        </h4>
                                        <p className="text-sm font-mono text-muted-foreground truncate max-w-[300px]" title={currentBackupName || ''}>
                                            {currentBackupName}
                                        </p>

                                        {!isExternalMode && selectedBackup && (
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                <Badge variant={getBackupType(selectedBackup.filename) === 'Système' ? "default" : "secondary"}>
                                                    {getBackupType(selectedBackup.filename)}
                                                </Badge>
                                                {isEncrypted(selectedBackup.filename) && (
                                                    <Badge variant="outline" className="gap-1">
                                                        <Lock className="h-3 w-3" /> Chiffré
                                                    </Badge>
                                                )}
                                                <span className="text-xs text-muted-foreground">
                                                    {formatSize(selectedBackup.size)} • {formatDistanceToNow(new Date(selectedBackup.createdAt), { addSuffix: true })}
                                                </span>
                                            </div>
                                        )}

                                        {isExternalMode && (
                                            <Badge className="mt-1 bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-200">
                                                Restore External
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" size="sm" onClick={() => setShowPickerModal(true)}>
                                        Changer...
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => {
                                        onSelectBackup(null);
                                        setValidationResult(null);
                                    }}>
                                        Effacer
                                    </Button>
                                </div>
                            </div>

                            {/* Validation Status */}
                            {validating && (
                                <div className="flex items-center gap-2 text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span className="text-sm">Validation en cours...</span>
                                </div>
                            )}

                            {!validating && validationResult && (
                                <>
                                    {validationResult.error && !validationResult.needsDecryptionKey ? (
                                        <Alert variant="destructive">
                                            <X className="h-4 w-4" />
                                            <AlertTitle>Sauvegarde Invalide</AlertTitle>
                                            <AlertDescription>{validationResult.error}</AlertDescription>
                                        </Alert>
                                    ) : (
                                        <div className="space-y-4">
                                            {/* Status Box: Green (Verified) OR Amber (Locked) */}
                                            {validationResult.needsDecryptionKey ? (
                                                <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                                                    <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
                                                    <div>
                                                        <h5 className="font-medium text-amber-700 dark:text-amber-400">Backup Chiffré</h5>
                                                        <p className="text-sm text-muted-foreground">
                                                            Ce fichier est protégé par une clé inconnue. Entrez la clé ci-dessous pour continuer.
                                                        </p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                                                    <ShieldCheck className="h-5 w-5 text-green-600 mt-0.5" />
                                                    <div>
                                                        <h5 className="font-medium text-green-700 dark:text-green-400">Backup Vérifié</h5>
                                                        <p className="text-sm text-muted-foreground">
                                                            Version App : {validationResult.manifest?.appVersion || 'Inconnue'} •
                                                            Type : {validationResult.manifest?.type || 'Système'}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Decryption Key Input 
                                                Show if:
                                                A) Explicitly needed (needsDecryptionKey = true)
                                                B) OR it is an external backup AND it is encrypted (detected via validation checks or filename)
                                                   Actually, backend validation should tell us needsDecryptionKey.
                                            */}
                                            {validationResult.needsDecryptionKey && (
                                                <div className="space-y-2 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                                                    <Label htmlFor="decryptionKey" className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                                                        <KeyRound className="h-4 w-4" /> Clé de déchiffrement requise
                                                    </Label>
                                                    <Input
                                                        id="decryptionKey"
                                                        type="password"
                                                        placeholder="Entrez la clé de chiffrement..."
                                                        value={decryptionKey}
                                                        onChange={(e) => setDecryptionKey(e.target.value)}
                                                    />
                                                    <p className="text-xs text-muted-foreground">
                                                        Utilisée une seule fois pour cette restauration. Jamais stockée.
                                                    </p>
                                                </div>
                                            )}

                                            {/* Warning */}
                                            <Alert variant="destructive" className="bg-destructive/5 border-destructive/20 dark:border-red-900/50">
                                                <TriangleAlert className="h-4 w-4 text-destructive dark:text-red-400" />
                                                <AlertTitle className="text-destructive dark:text-red-400">Attention</AlertTitle>
                                                <AlertDescription className="text-destructive/90 dark:text-red-300">
                                                    Toutes les sessions seront invalidées. Vous serez déconnecté immédiatement.
                                                </AlertDescription>
                                            </Alert>

                                            {/* Restore Button */}
                                            <Button
                                                variant="destructive"
                                                className="w-full"
                                                onClick={() => {
                                                    setConfirmInput('');
                                                    setShowConfirmDialog(true);
                                                }}
                                                disabled={validationResult.needsDecryptionKey && !decryptionKey}
                                            >
                                                Restaurer le Système
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        /* No backup selected - Show prompt */
                        <div className="space-y-4">
                            <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center bg-muted/5">
                                <TriangleAlert className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                <h3 className="font-semibold text-lg">Aucune sauvegarde sélectionnée</h3>
                                <p className="text-sm text-muted-foreground mt-2 mb-4">
                                    Sélectionnez une sauvegarde existante ou uploadez un fichier externe <br />
                                    pour lancer une restauration.
                                </p>
                                <div className="flex justify-center gap-2">
                                    <Button variant="outline" onClick={() => setShowPickerModal(true)}>
                                        Choisir sur le serveur
                                    </Button>
                                    <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                        <Upload className="h-4 w-4 mr-2" />
                                        Restore External File
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Hidden file input for Restore External */}
                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".enc,.zip,.tar.gz"
                        onChange={handleRestoreExternalFile}
                        disabled={validating}
                    />
                </CardContent>

                {/* Backup Picker Modal */}
                <Dialog open={showPickerModal} onOpenChange={setShowPickerModal}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>Sélectionner une sauvegarde</DialogTitle>
                            <DialogDescription>
                                Choisissez un point de restauration depuis l'historique serveur.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="max-h-[300px] overflow-auto space-y-2">
                            {backups.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">Aucune sauvegarde disponible</p>
                            ) : (
                                backups.map((backup) => (
                                    <div
                                        key={backup.filename}
                                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedBackup?.filename === backup.filename
                                            ? 'border-primary bg-primary/5'
                                            : 'hover:bg-muted'
                                            }`}
                                        onClick={() => {
                                            onSelectBackup(backup);
                                            setShowPickerModal(false);
                                        }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {getBackupType(backup.filename) === 'Système' ? (
                                                    <FolderArchive className="h-4 w-4 text-blue-500" />
                                                ) : (
                                                    <Database className="h-4 w-4 text-orange-500" />
                                                )}
                                                <span className="font-medium">{getBackupType(backup.filename)}</span>
                                                {isEncrypted(backup.filename) && (
                                                    <Lock className="h-3 w-3 text-muted-foreground" />
                                                )}
                                            </div>
                                            <span className="text-xs text-muted-foreground">{formatSize(backup.size)}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate">
                                            {backup.filename}
                                        </p>
                                        <p className="text-xs text-muted-foreground">
                                            {formatDate(backup.createdAt)}
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="h-4 w-4 mr-2" />
                                Restore External File
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Confirmation Dialog */}
                <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2 text-destructive">
                                <TriangleAlert className="h-5 w-5" /> Confirmation Critique
                            </DialogTitle>
                            <DialogDescription>
                                Vous êtes sur le point de restaurer le système.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-4">
                            <Alert variant="destructive">
                                <AlertTitle>Impact Immédiat :</AlertTitle>
                                <AlertDescription>
                                    <ul className="list-disc pl-4 space-y-1 mt-2 text-xs">
                                        <li>La base de données sera <strong>écrasée</strong>.</li>
                                        <li>Les fichiers uploadés seront <strong>remplacés</strong>.</li>
                                        <li>Vous serez <strong>déconnecté</strong> immédiatement.</li>
                                    </ul>
                                </AlertDescription>
                            </Alert>

                            <div className="space-y-2">
                                <Label className="text-sm font-medium">
                                    Tapez <strong>RESTORE</strong> pour confirmer :
                                </Label>
                                <Input
                                    value={confirmInput}
                                    onChange={(e) => setConfirmInput(e.target.value)}
                                    placeholder="RESTORE"
                                    className="font-mono tracking-widest uppercase"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>Annuler</Button>
                            <Button
                                variant="destructive"
                                onClick={handleRestore}
                                disabled={confirmInput !== 'RESTORE' || isRestoring}
                            >
                                {isRestoring && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                CONFIRMER RESTORE
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </Card>
        );
    }
);

RestoreZone.displayName = 'RestoreZone';

