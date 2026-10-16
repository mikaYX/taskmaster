import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import type { ChecklistStep } from '@/api/types';

export function ChecklistEditor({ value, onChange }: { value: ChecklistStep[]; onChange: (value: ChecklistStep[]) => void }) {
    const { t } = useTranslation();
    const update = (index: number, data: Partial<ChecklistStep>) => onChange(value.map((item, i) => i === index ? { ...item, ...data } : item));
    return <section className="rounded-lg border p-4 space-y-3">
        <h3 className="font-semibold">{t('execution.checklist')}</h3>
        <p className="text-sm text-muted-foreground">{t('execution.optionalDescription')}</p>
        {value.map((step, index) => <div key={step.id} className="flex flex-wrap items-center gap-3">
            <Input className="flex-1 min-w-48" aria-label={t('execution.stepLabel', { number: index + 1 })} maxLength={255} value={step.label} onChange={event => update(index, { label: event.target.value })} />
            {!step.label.trim() && <span className="text-xs text-destructive">{t('execution.labelRequired')}</span>}
            <select className="rounded-md border bg-background p-2 text-sm" aria-label={t('execution.stepKind', { number: index + 1 })} value={step.kind} onChange={event => update(index, { kind: event.target.value as ChecklistStep['kind'] })}>
                {(['CHECK', 'TEXT', 'NUMBER', 'PHOTO'] as const).map(kind => <option key={kind} value={kind}>{t(`execution.kind.${kind}`)}</option>)}
            </select>
            <Label className="flex items-center gap-2"><Checkbox checked={step.required} onCheckedChange={checked => update(index, { required: checked === true })} />{t('execution.required')}</Label>
            <Button type="button" variant="ghost" aria-label={t('execution.removeStep', { number: index + 1 })} onClick={() => onChange(value.filter((_, i) => i !== index))}>{t('common.delete')}</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={value.length >= 50} onClick={() => onChange([...value, { id: Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''), label: '', kind: 'CHECK', required: true }])}>{t('execution.addStep')}</Button>
    </section>;
}
