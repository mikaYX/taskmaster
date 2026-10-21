import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SetupStepLayoutProps {
    icon: LucideIcon;
    title: string;
    subtitle: string;
    children: ReactNode;
    /** Step buttons; kept visible at the bottom of the scroll area on short screens. */
    actions: ReactNode;
}

export function SetupStepLayout({ icon: Icon, title, subtitle, children, actions }: SetupStepLayoutProps) {
    return (
        <div className="flex flex-1 flex-col">
            <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-6 w-6" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                </div>
            </div>

            <div className="mt-8 flex-1 space-y-5 pb-6">{children}</div>

            <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6 lg:mx-0 lg:mb-6 lg:rounded-b-none lg:px-0">
                {actions}
            </div>
        </div>
    );
}
