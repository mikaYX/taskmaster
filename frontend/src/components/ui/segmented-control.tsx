import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
    value: T;
    label: string;
}

interface SegmentedControlProps<T extends string> {
    options: SegmentedOption<T>[];
    value: T | null | undefined;
    onChange: (value: T) => void;
    /** Accessible name of the group (screen readers announce it before the options). */
    ariaLabel: string;
    className?: string;
}

/** Pill-shaped single choice: the selected option is filled with the accent colour. */
export function SegmentedControl<T extends string>({
    options,
    value,
    onChange,
    ariaLabel,
    className,
}: SegmentedControlProps<T>) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className={cn('inline-flex items-center gap-0.5 rounded-full bg-muted/60 p-1 ring-1 ring-border/60', className)}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            'h-7 rounded-full px-3.5 text-xs font-medium transition-all duration-200 outline-none',
                            'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                            active
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
