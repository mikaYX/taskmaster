import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle } from 'lucide-react';
import type { BoardItem, TaskStatusValue } from '@/api/types';

interface AdminStatusDialogProps {
    item: BoardItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (data: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) => void;
}

export function AdminStatusDialog({ item, open, onOpenChange, onConfirm }: AdminStatusDialogProps) {
    const [status, setStatus] = useState<TaskStatusValue>('RUNNING');
    const [comment, setComment] = useState('');

    if (!item) return null;

    const handleConfirm = () => {
        onConfirm({ taskId: item.taskId, date: item.instanceDate, status, comment: comment || undefined });
        setComment('');
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Modifier le statut</DialogTitle>
                    <DialogDescription>
                        {item.taskName} — {item.instanceDate}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {item.status === 'FAILED' && item.validation?.comment && (
                        <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle className="text-sm font-semibold mb-1">Motif de l'échec précédent</AlertTitle>
                            <AlertDescription className="text-xs">{item.validation.comment}</AlertDescription>
                        </Alert>
                    )}
                    <div className="space-y-2">
                        <Label>Nouveau statut</Label>
                        <Select value={status} onValueChange={(v) => setStatus(v as TaskStatusValue)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="RUNNING">En cours</SelectItem>
                                <SelectItem value="SUCCESS">Validé</SelectItem>
                                <SelectItem value="FAILED">Échoué</SelectItem>
                                <SelectItem value="MISSING">Manquée</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Commentaire (optionnel)</Label>
                        <Textarea
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="Raison du changement..."
                            rows={3}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Annuler
                    </Button>
                    <Button onClick={handleConfirm}>
                        Confirmer
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
