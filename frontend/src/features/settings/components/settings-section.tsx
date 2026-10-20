import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SettingsSectionProps {
    title: string;
    description?: string;
    /** Small icon shown in a tile before the title. */
    icon?: LucideIcon;
    /** Something on the right of the header: a switch, a button, a badge. */
    action?: ReactNode;
    /** Shown under the content, on a tinted strip (typically the save button). */
    footer?: ReactNode;
    className?: string;
    children?: ReactNode;
}

/** The card every settings tab is built from, so all tabs look alike. */
export function SettingsSection({ title, description, icon: Icon, action, footer, className, children }: SettingsSectionProps) {
    return (
        <section className={cn('overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
            <div className={cn('flex items-start gap-3 px-6 py-4', children && 'border-b')}>
                {Icon && (
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                    </span>
                )}
                <div className="min-w-0 flex-1">
                    <h3 className="font-semibold leading-tight">{title}</h3>
                    {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
                </div>
                {action && <div className="shrink-0">{action}</div>}
            </div>
            {children && <div className="space-y-4 px-6 py-5">{children}</div>}
            {footer && <div className="flex items-center justify-end gap-2 border-t bg-muted/30 px-6 py-3">{footer}</div>}
        </section>
    );
}
