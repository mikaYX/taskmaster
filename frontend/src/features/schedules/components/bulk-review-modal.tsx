import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertTriangle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

interface ScheduleItem {
    taskId: number;
    taskName: string;
    siteId?: string | null;
    label?: string | null;
    // Add other relevant fields if needed for display
}

interface BulkReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    items: ScheduleItem[];
    isSubmitting: boolean;
    existingScheduleTaskIds?: Set<number>; // For conflict detection
}

export function BulkReviewModal({
    isOpen,
    onClose,
    onConfirm,
    items,
    isSubmitting,
    existingScheduleTaskIds = new Set(),
}: BulkReviewModalProps) {

    // Validation Logic
    const hasDuplicates = useMemo(() => {
        const ids = new Set<number>();
        for (const item of items) {
            if (ids.has(item.taskId)) return true;
            ids.add(item.taskId);
        }
        return false;
    }, [items]);

    const isTooMany = items.length > 50;
    const isEmpty = items.length === 0;

    const isValid = !hasDuplicates && !isTooMany && !isEmpty;

    // Conflict Warning (Non-blocking)
    const conflicts = useMemo(() => {
        return items.filter(i => existingScheduleTaskIds.has(i.taskId));
    }, [items, existingScheduleTaskIds]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Review Bulk Schedule Creation</DialogTitle>
                    <DialogDescription>
                        You are about to create {items.length} schedule(s). Please review details below.
                    </DialogDescription>
                </DialogHeader>

                {/* Validation Errors */}
                <div className="space-y-4">
                    {isTooMany && (
                        <Alert variant="destructive">
                            <X className="h-4 w-4" />
                            <AlertTitle>Start Limit Exceeded</AlertTitle>
                            <AlertDescription>
                                You cannot create more than 50 schedules at once. Current: {items.length}.
                            </AlertDescription>
                        </Alert>
                    )}
                    {hasDuplicates && (
                        <Alert variant="destructive">
                            <X className="h-4 w-4" />
                            <AlertTitle>Duplicate Tasks</AlertTitle>
                            <AlertDescription>
                                You have selected the same task multiple times. Please remove duplicates.
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Conflict Warnings */}
                    {!hasDuplicates && conflicts.length > 0 && (
                        <Alert className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-900/10 dark:text-amber-200">
                            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            <AlertTitle>Potential Conflicts</AlertTitle>
                            <AlertDescription>
                                {conflicts.length} task(s) already have an active schedule. This will create a second schedule for them.
                            </AlertDescription>
                        </Alert>
                    )}

                    <ScrollArea className="h-[300px] rounded-md border p-4">
                        {isEmpty ? (
                            <div className="text-center text-muted-foreground py-8">
                                No items to review.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {items.map((item, idx) => {
                                    const isConflict = existingScheduleTaskIds.has(item.taskId);
                                    return (
                                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium truncate">{item.taskName}</span>
                                                    {isConflict && (
                                                        <Badge variant="outline" className="text-amber-600 border-amber-500 text-[10px] h-5 px-1">
                                                            Existing
                                                        </Badge>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                                                    <span>ID: {item.taskId}</span>
                                                    {item.siteId && <span>• Site: {item.siteId}</span>}
                                                    {item.label && <span>• Label: {item.label}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Back to Edit
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={!isValid || isSubmitting}
                        className={!isValid ? "opacity-50 cursor-not-allowed" : ""}
                    >
                        {isSubmitting ? "Saving..." : "Confirm & Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
