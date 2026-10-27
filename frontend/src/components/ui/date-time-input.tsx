import { useTranslation } from 'react-i18next';
import { DateInput } from '@/components/ui/date-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const pad = (n: number) => String(n).padStart(2, '0');
const HOURS = Array.from({ length: 24 }, (_, h) => pad(h));
const MINUTES = Array.from({ length: 12 }, (_, i) => pad(i * 5));

interface DateTimeInputProps {
    /** `yyyy-MM-ddTHH:mm`, or an empty string (same contract as `<input type="datetime-local">`). */
    value: string;
    onChange: (value: string) => void;
    id?: string;
    className?: string;
    disabled?: boolean;
    /** Time given when a day is picked before any time (`HH:mm`). */
    defaultTime?: string;
}

/**
 * Date and time whose display follows the app language, like `DateInput`: a native
 * `datetime-local` input uses the browser's own locale (and 12-hour clock) instead. Time is 24-hour,
 * in 5-minute steps.
 */
export function DateTimeInput({ value, onChange, id, className, disabled, defaultTime = '00:00' }: DateTimeInputProps) {
    const { t } = useTranslation();
    const day = value.slice(0, 10);
    const [hour, minute] = (value.slice(11, 16) || '').split(':');

    const setTime = (nextHour: string, nextMinute: string) => day && onChange(`${day}T${nextHour}:${nextMinute}`);

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <DateInput
                id={id}
                className="min-w-0 flex-1"
                value={day}
                disabled={disabled}
                clearable
                onChange={(next) => onChange(next ? `${next}T${value.slice(11, 16) || defaultTime}` : '')}
            />
            <Select value={hour ?? ''} onValueChange={(next) => setTime(next, minute || '00')} disabled={disabled || !day}>
                <SelectTrigger className="w-[68px] shrink-0" aria-label={t('dateTimeInput.hour')}><SelectValue placeholder="--" /></SelectTrigger>
                <SelectContent>{HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
            </Select>
            <span aria-hidden="true" className="text-muted-foreground">:</span>
            <Select value={minute ?? ''} onValueChange={(next) => setTime(hour || '00', next)} disabled={disabled || !day}>
                <SelectTrigger className="w-[68px] shrink-0" aria-label={t('dateTimeInput.minute')}><SelectValue placeholder="--" /></SelectTrigger>
                <SelectContent>{MINUTES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
        </div>
    );
}
