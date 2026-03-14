import { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
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
}

export function TaskListSection({ title, items, emptyMessage, onStatusChange, onAdminAction, readonly }: TaskListSectionProps) {
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
            <div className="rounded-xl border border-border overflow-hidden bg-card">
                <CollapsibleTrigger asChild>
                    <button
                        className="flex items-center justify-between w-full px-5 py-3 bg-emerald-500/[0.07] border-l-[3px] border-l-emerald-500 hover:bg-emerald-500/[0.12] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
                            <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
                            <span className="text-[11px] text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full font-medium">
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
