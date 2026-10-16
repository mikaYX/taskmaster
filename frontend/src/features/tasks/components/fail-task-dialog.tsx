import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    const { t } = useTranslation();
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
                    <DialogTitle>{t('taskBoard.failDialogTitle')}</DialogTitle>
                    <DialogDescription>
                        {t('taskBoard.failOptionalDescription')}
                    </DialogDescription>
                </DialogHeader>

                <div className="py-2">
                    <Textarea
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        placeholder={t('taskBoard.failCommentPlaceholder')}
                        className="min-h-[100px]"
                    />
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                    >
                        {t('taskBoard.confirmFail')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
