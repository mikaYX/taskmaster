import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, isValid, parse } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { getDateLocale } from '@/lib/date-locale';

const ISO_DAY = 'yyyy-MM-dd';

interface DateInputProps {
    /** `yyyy-MM-dd`, or an empty string when no date is chosen (same contract as `<input type="date">`). */
    value: string;
    onChange: (value: string) => void;
    id?: string;
    'aria-label'?: string;
    className?: string;
    disabled?: boolean;
    /** Shows a "clear" button in the picker. */
    clearable?: boolean;
}

/**
 * Date picker whose display follows the language chosen in the app (dd/MM/yyyy in French,
 * MM/dd/yyyy in English). A native `<input type="date">` can't: browsers format it
 * with their own locale, whatever the app language is.
 */
export function DateInput({ value, onChange, id, 'aria-label': ariaLabel, className, disabled, clearable = true }: DateInputProps) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const locale = getDateLocale();

    const parsed = value ? parse(value, ISO_DAY, new Date()) : undefined;
    const selected = parsed && isValid(parsed) ? parsed : undefined;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    id={id}
                    type="button"
                    variant="outline"
                    disabled={disabled}
                    aria-label={ariaLabel}
                    className={cn('h-9 w-full justify-start gap-2 px-3 font-normal', !selected && 'text-muted-foreground', className)}
                >
                    <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{selected ? format(selected, 'P', { locale }) : t('dateInput.placeholder')}</span>
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    selected={selected}
                    defaultMonth={selected}
                    onSelect={(day) => {
                        if (!day) return;
                        onChange(format(day, ISO_DAY));
                        setOpen(false);
                    }}
                />
                {clearable && selected && (
                    <div className="border-t p-2">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                                onChange('');
                                setOpen(false);
                            }}
                        >
                            {t('dateInput.clear')}
                        </Button>
                    </div>
                )}
            </PopoverContent>
        </Popover>
    );
}
