import { useState } from 'react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

interface FailTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onConfirm: (comment?: string) => void;
}

export function FailTaskDialog({ open, onOpenChange, onConfirm }: FailTaskDialogProps) {
    const [comment, setComment] = useState('');

    const handleConfirm = () => {
        onConfirm(comment.trim() || undefined);
        setComment('');
        onOpenChange(false);
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(val) => {
                onOpenChange(val);
                if (!val) setComment('');
            }}
        >
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Signaler un échec</DialogTitle>
                    <DialogDescription>
                        Veuillez indiquer pourquoi la tâche a échoué (optionnel)
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder="Saisissez votre commentaire ici..."
                        className="min-h-[100px]"
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Annuler
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                    >
                        Confirmer l'échec
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
