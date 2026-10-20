import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LANGUAGES, setLanguage } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Language Toggle.
 *
 * A pill with a globe and the current language code (FR, EN); the menu lists the languages.
 */
export function LanguageToggle({ className }: { className?: string }) {
    const { t, i18n } = useTranslation();
    const current = (i18n.resolvedLanguage ?? i18n.language ?? 'en').slice(0, 2);

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant="outline"
                    className={cn('h-10 gap-2 rounded-full bg-card px-3.5 text-sm font-semibold shadow-sm data-[state=open]:bg-accent', className)}
                >
                    <Globe className="h-4 w-4 text-primary max-sm:hidden" />
                    <span aria-hidden="true">{current.toUpperCase()}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground max-sm:hidden" />
                    <span className="sr-only">{t('common.toggleLanguage')}</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
                <DropdownMenuLabel className="px-2 text-xs font-normal text-muted-foreground">{t('common.toggleLanguage')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {LANGUAGES.map((lang) => {
                    const active = current === lang.code;
                    return (
                        <DropdownMenuItem
                            key={lang.code}
                            onClick={() => setLanguage(lang.code as 'en' | 'fr')}
                            className={cn('gap-3 rounded-lg py-2.5', active && 'bg-primary/5 font-medium')}
                        >
                            <span className={cn(
                                'flex h-7 w-8 items-center justify-center rounded-md text-[11px] font-bold',
                                active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                            )}>
                                {lang.code.toUpperCase()}
                            </span>
                            <span className="flex-1">{lang.name}</span>
                            {active && <Check className="h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                    );
                })}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
