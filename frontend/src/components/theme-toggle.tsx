import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/theme-provider';
import { cn } from '@/lib/utils';

const THEMES = [
    { value: 'light', icon: Sun },
    { value: 'dark', icon: Moon },
    { value: 'system', icon: Monitor },
] as const;

/**
 * Theme switch: light, dark and system side by side, the chosen one raised.
 * On phones, where there is no room for three buttons, one round button cycles through them.
 */
export function ThemeToggle({ className }: { className?: string }) {
    const { t } = useTranslation();
    const { theme, setTheme } = useTheme();
    const index = Math.max(0, THEMES.findIndex((item) => item.value === theme));
    const Current = THEMES[index].icon;
    const next = THEMES[(index + 1) % THEMES.length];

    return (
        <>
            <button
                type="button"
                onClick={() => setTheme(next.value)}
                aria-label={t('theme.toggle')}
                title={t(`theme.${THEMES[index].value}`)}
                className="flex h-10 w-10 items-center justify-center rounded-full border bg-card text-primary shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
            >
                <Current className="h-[18px] w-[18px]" />
            </button>
            <div
                role="radiogroup"
                aria-label={t('theme.toggle')}
                className={cn('hidden h-10 items-center gap-0.5 rounded-full border bg-muted/60 p-1 shadow-sm md:flex', className)}
            >
                {THEMES.map(({ value, icon: Icon }) => {
                    const active = theme === value;
                    return (
                        <button
                            key={value}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            aria-label={t(`theme.${value}`)}
                            title={t(`theme.${value}`)}
                            onClick={() => setTheme(value)}
                            className={cn(
                                'flex h-8 w-8 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                active
                                    ? 'bg-background text-primary shadow-sm'
                                    : 'text-muted-foreground hover:bg-background/60 hover:text-foreground',
                            )}
                        >
                            <Icon className="h-4 w-4" />
                        </button>
                    );
                })}
            </div>
        </>
    );
}
