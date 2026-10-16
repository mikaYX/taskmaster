import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SavedBoardView } from '../lib/board-views';

export function SavedViewsDialog({ views, onSave, onApply, onDelete, persisted }: {
    views: SavedBoardView[]; onSave: (name: string) => 'duplicate' | 'limit' | undefined;
    onApply: (view: SavedBoardView) => void; onDelete: (id: string) => void; persisted: boolean;
}) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState<'duplicate' | 'limit' | undefined>();
    return <>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>{t('boardViews.title')}</Button>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
                <DialogHeader><DialogTitle>{t('boardViews.title')}</DialogTitle><DialogDescription>{t('boardViews.description')}</DialogDescription></DialogHeader>
                <Label htmlFor="board-view-name">{t('boardViews.name')}</Label>
                <Input id="board-view-name" value={name} maxLength={60} onChange={event => { setName(event.target.value); setError(undefined); }} />
                <Button disabled={!name.trim() || views.length >= 20} onClick={() => { const result = onSave(name.trim()); setError(result); if (!result) setName(''); }}>{t('boardViews.save')}</Button>
                {views.length >= 20 && <p className="text-sm text-muted-foreground">{t('boardViews.limit')}</p>}
                {error && <p role="alert" className="text-sm text-destructive">{t(`boardViews.${error}`)}</p>}
                {!persisted && <p role="alert" className="text-sm text-destructive">{t('boardViews.storageUnavailable')}</p>}
                <div className="max-h-72 space-y-2 overflow-y-auto">
                    {views.map(view => <div key={view.id} className="flex items-center gap-2 rounded-md border p-2">
                        <Button className="flex-1 justify-start truncate" variant="ghost" onClick={() => { onApply(view); setOpen(false); }}>{view.name}</Button>
                        <Button variant="ghost" aria-label={t('boardViews.delete', { name: view.name })} onClick={() => onDelete(view.id)}>{t('common.delete')}</Button>
                    </div>)}
                    {views.length === 0 && <p className="text-sm text-muted-foreground">{t('boardViews.empty')}</p>}
                </div>
            </DialogContent>
        </Dialog>
    </>;
}
