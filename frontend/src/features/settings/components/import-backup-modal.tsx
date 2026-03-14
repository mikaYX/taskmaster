
import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Loader2, Upload, FileUp, AlertCircle } from 'lucide-react';
import { backupApi } from '@/api/backup';
import { toast } from 'sonner';

interface ImportBackupModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

export function ImportBackupModal({ open, onOpenChange, onSuccess }: ImportBackupModalProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setSelectedFile(e.target.files[0]);
        }
    };

    const handleImport = async () => {
        if (!selectedFile) return;

        setIsUploading(true);
        try {
            await backupApi.import(selectedFile);
            toast.success('Backup imported into history');
            onOpenChange(false);
            onSuccess();
        } catch (e) {
            console.error(e);
            toast.error('Import failed');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Import Backup File</DialogTitle>
                    <DialogDescription>
                        Upload an existing backup file (.enc, .tar.gz) to add it to the history.
                        You can restore from it after import.
                    </DialogDescription>
                </DialogHeader>

                <div className="py-4 space-y-4">
                    {!selectedFile ? (
                        <div
                            className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center hover:bg-muted/50 cursor-pointer transition-colors"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Upload className="h-8 w-8 text-muted-foreground mb-4" />
                            <h3 className="font-semibold">Click to Upload</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                                Supported formats: .tar.gz.enc, .db.dump
                            </p>
                            <input
                                type="file"
                                ref={fileInputRef}
                                className="hidden"
                                accept=".enc,.zip,.tar.gz,.dump"
                                onChange={handleFileSelect}
                            />
                        </div>
                    ) : (
                        <div className="flex items-center justify-between bg-muted/30 p-4 rounded-lg border">
                            <div className="flex items-center gap-3">
                                <FileUp className="h-5 w-5 text-blue-500" />
                                <div>
                                    <p className="font-medium truncate max-w-[250px]">{selectedFile.name}</p>
                                    <p className="text-xs text-muted-foreground">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                                </div>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>Change</Button>
                        </div>
                    )}

                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Note</AlertTitle>
                        <AlertDescription>
                            This does NOT restore the system immediately. It just adds the file to your backup list.
                        </AlertDescription>
                    </Alert>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleImport} disabled={!selectedFile || isUploading}>
                        {isUploading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Upload & Import
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
