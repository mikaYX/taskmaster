import { useTranslation } from 'react-i18next';
import { Info, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Rows of the cheat sheet: what to type, and what it does (`todos.quickHelp.rows.<key>`). */
const ROWS: { key: string; examples: string }[] = [
    { key: 'day', examples: '@demain  @lundi' },
    { key: 'relative', examples: '@+3j  @+2s' },
    { key: 'date', examples: '@02/11  @2026-11-02' },
    { key: 'time', examples: '@14h30  @9h' },
    { key: 'priority', examples: '!haute  !urgente' },
];

/** A small "i" button explaining the quick-add words with examples. */
export function TodoQuickAddHelp({ align = 'end' }: { align?: 'start' | 'center' | 'end' }) {
    const { t } = useTranslation();

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full text-muted-foreground hover:text-primary"
                    aria-label={t('todos.quickHelp.button')}
                    title={t('todos.quickHelp.button')}
                >
                    <Info className="h-4 w-4" />
                </Button>
            </PopoverTrigger>
            <PopoverContent align={align} className="w-80 space-y-3 p-4">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Sparkles className="h-4 w-4" />
                    </span>
                    <h3 className="text-sm font-semibold">{t('todos.quickHelp.title')}</h3>
                </div>
                <p className="text-xs text-muted-foreground">{t('todos.quickHelp.intro')}</p>

                <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                    <p className="font-mono text-[12px]">
                        {t('todos.quickHelp.exampleTitle')}{' '}
                        <span className="rounded bg-primary/10 px-1 text-primary">@demain</span>{' '}
                        <span className="rounded bg-primary/10 px-1 text-primary">@14h30</span>{' '}
                        <span className="rounded bg-red-500/10 px-1 text-red-600 dark:text-red-400">!urgente</span>
                    </p>
                    <p className="mt-2 text-muted-foreground">→ {t('todos.quickHelp.exampleResult')}</p>
                </div>

                <dl className="space-y-1.5 text-xs">
                    {ROWS.map((row) => (
                        <div key={row.key} className="flex items-baseline justify-between gap-3">
                            <dt className="text-muted-foreground">{t(`todos.quickHelp.rows.${row.key}`)}</dt>
                            <dd className="whitespace-pre font-mono text-[11px]">{row.examples}</dd>
                        </div>
                    ))}
                </dl>

                <p className="border-t pt-2 text-[11px] text-muted-foreground">{t('todos.quickHelp.footer')}</p>
            </PopoverContent>
        </Popover>
    );
}
