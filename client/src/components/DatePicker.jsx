import React from 'react';
import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { Calendar as CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function DatePicker({ date, onDateChange, lang = "EN", placeholder = "Pick a date" }) {
    const [open, setOpen] = React.useState(false);
    const locale = lang === "FR" ? fr : enUS;

    const handleSelect = (selectedDate) => {
        if (selectedDate) {
            // Format date as YYYY-MM-DD for input compatibility
            const formattedDate = format(selectedDate, 'yyyy-MM-dd');
            onDateChange(formattedDate);
            setOpen(false);
        }
    };

    // Parse date string to Date object
    const dateObj = date ? new Date(date + 'T00:00:00') : undefined;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'w-full justify-start text-left font-normal',
                        !date && 'text-muted-foreground'
                    )}
                >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {date ? (
                        format(dateObj, 'PPP', { locale })
                    ) : (
                        <span>{placeholder}</span>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 shadow-lg" align="start">
                <Calendar
                    mode="single"
                    selected={dateObj}
                    onSelect={handleSelect}
                    initialFocus
                    locale={locale}
                />
            </PopoverContent>
        </Popover>
    );
}
