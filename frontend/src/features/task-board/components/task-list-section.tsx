import { useState, useEffect } from 'react';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import type { BoardItem, TaskStatusValue } from '@/api/types';
import { TaskRow } from './task-row';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface TaskListSectionProps {
    title: string;
    items: BoardItem[];
    emptyMessage?: string;
    onStatusChange: (data: { taskId: number; date: string; status: TaskStatusValue; comment?: string }) => void;
    onAdminAction?: (item: BoardItem) => void;
    readonly?: boolean;
    compact?: boolean;
}

export function TaskListSection({ title, items, emptyMessage, onStatusChange, onAdminAction, readonly, compact }: TaskListSectionProps) {
    const slug = title.toLowerCase().replace(/[^a-z0-0]/g, '-');
    const storageKey = `taskboard-section-expanded-${slug}`;

    const [isExpanded, setIsExpanded] = useState(() => {
        const saved = localStorage.getItem(storageKey);
        return saved !== null ? saved === 'true' : true;
    });

    useEffect(() => {
        localStorage.setItem(storageKey, isExpanded.toString());
    }, [isExpanded, storageKey]);

    const contentId = `section-content-${slug}`;

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <CollapsibleTrigger asChild>
                    <button
                        className="flex w-full items-center justify-between px-5 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-[state=open]:border-b"
                        aria-expanded={isExpanded}
                        aria-controls={contentId}
                    >
                        <div className="flex items-center gap-2.5">
                            <ChevronDown
                                className={cn(
                                    "h-4 w-4 text-muted-foreground transition-transform duration-200",
                                    !isExpanded && "-rotate-90"
                                )}
                            />
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
                                <CheckCircle2 className="h-4 w-4" />
                            </span>
                            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                                {items.length}
                            </span>
                        </div>
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent id={contentId}>
                    <div className="transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
                        {items.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-10">
                                {emptyMessage || 'Aucune tâche'}
                            </p>
                        ) : (
                            items.map(item => (
                                <TaskRow
                                    key={`${item.taskId}-${item.instanceDate}`}
                                    item={item}
                                    onStatusChange={onStatusChange}
                                    onAdminAction={onAdminAction}
                                    compact={compact}
                                    readonly={readonly}
                                />
                            ))
                        )}
                    </div>
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
}
