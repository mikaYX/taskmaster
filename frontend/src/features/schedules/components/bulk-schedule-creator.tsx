import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Plus, Trash, AlertCircle } from "lucide-react";
import { tasksApi } from "@/api/tasks";
import { schedulesApi } from "@/api/schedules";
import { toast } from "sonner";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BulkReviewModal } from "./bulk-review-modal";
import { Badge } from "@/components/ui/badge";

interface ScheduleItem {
    taskId: number;
    taskName: string;
    siteId?: string;
    label?: string;
}

interface BulkScheduleCreatorProps {
    existingSchedules?: { taskId: number }[]; // To detecting conflicts
    trigger?: React.ReactNode;
}

export function BulkScheduleCreator({ existingSchedules = [], trigger }: BulkScheduleCreatorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isReviewOpen, setIsReviewOpen] = useState(false);
    const [draftItems, setDraftItems] = useState<ScheduleItem[]>([]);

    // Form inputs
    const [selectedTaskId, setSelectedTaskId] = useState<string>("");
    const [siteId, setSiteId] = useState("");
    const [scheduleLabel, setScheduleLabel] = useState("");

    const queryClient = useQueryClient();

    // Fetch Tasks for Selection
    const { data: tasks } = useQuery({
        queryKey: ['tasks-list-slim'],
        queryFn: () => tasksApi.getAll({ limit: 1000 }).then(res => res.filter(t => t.isActive)), // Only active tasks
        staleTime: 5 * 60 * 1000,
    });

    // Detect Conflicts set (only ACTIVE schedules)
    const existingTaskIds = useMemo(() => {
        return new Set(
            existingSchedules
                .filter(s => (s as any).status === 'ACTIVE') // safely access status if type is loose, or cast properly
                .map(s => s.taskId)
        );
    }, [existingSchedules]);

    const addToDraft = () => {
        if (!selectedTaskId) return;

        const task = tasks?.find(t => t.id === Number(selectedTaskId));
        if (!task) return;

        const newItem: ScheduleItem = {
            taskId: task.id,
            taskName: task.name,
            siteId: siteId || undefined,
            label: scheduleLabel || undefined,
        };

        // Check local duplicate
        if (draftItems.some(i => i.taskId === newItem.taskId)) {
            toast.error("This task is already in your draft list.");
            return;
        }

        setDraftItems([...draftItems, newItem]);
        // Reset form
        setSelectedTaskId("");
        setSiteId("");
        setScheduleLabel("");
    };

    const removeFromDraft = (index: number) => {
        const newItems = [...draftItems];
        newItems.splice(index, 1);
        setDraftItems(newItems);
    };

    const mutation = useMutation({
        mutationFn: (items: ScheduleItem[]) => {
            // Transform to backend DTO
            const payload = {
                items: items.map(i => ({
                    taskId: i.taskId,
                    siteId: i.siteId,
                    label: i.label,
                    // Default values controlled by backend/task definition
                    recurrenceMode: 'ON_SCHEDULE',
                }))
            };
            return schedulesApi.createBulk(payload);
        },
        onSuccess: (data) => {
            toast.success(`Successfully created ${data.createdCount} schedules.`);
            queryClient.invalidateQueries({ queryKey: ['schedules-list'] });

            // Close all
            setIsReviewOpen(false);
            setIsOpen(false);
            setDraftItems([]);
        },
        onError: (err) => {
            toast.error("Failed to create schedules.");
            console.error(err);
        }
    });

    const handleConfirm = () => {
        mutation.mutate(draftItems);
    };

    const openChange = (open: boolean) => {
        if (!open) {
            // Reset checking? No, warn user? 
        }
        setIsOpen(open);
    };

    return (
        <>
            <Dialog open={isOpen} onOpenChange={openChange}>
                <DialogTrigger asChild>
                    {trigger || <Button>Manage Schedules</Button>}
                </DialogTrigger>
                <DialogContent className="max-w-3xl h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Manage Schedules (Bulk)</DialogTitle>
                        <DialogDescription>
                            Create schedules for multiple tasks at once.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 flex flex-col gap-6 min-h-0">
                        {/* Composer Area */}
                        <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
                            <h4 className="text-sm font-medium">Add to List</h4>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                                <div className="md:col-span-2 space-y-1.5">
                                    <Label>Task</Label>
                                    <Select value={selectedTaskId} onValueChange={setSelectedTaskId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select a task..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {(tasks || []).map(t => (
                                                <SelectItem key={t.id} value={String(t.id)}>
                                                    #{t.id} {t.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Site ID (Opt)</Label>
                                    <Input
                                        value={siteId}
                                        onChange={e => setSiteId(e.target.value)}
                                        placeholder="e.g. PAR-01"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Label (Opt)</Label>
                                    <Input
                                        value={scheduleLabel}
                                        onChange={e => setScheduleLabel(e.target.value)}
                                        placeholder="e.g. Morning Shift"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={addToDraft}
                                disabled={!selectedTaskId}
                                className="w-full"
                                variant="secondary"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Add to Draft
                            </Button>
                        </div>

                        {/* List Area */}
                        <div className="flex-1 border rounded-lg overflow-hidden flex flex-col">
                            <div className="bg-muted p-2 text-xs font-medium text-muted-foreground flex justify-between items-center">
                                <span>Draft Items ({draftItems.length})</span>
                                {draftItems.length > 50 && (
                                    <span className="text-destructive flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> Limit Exceeded (Max 50)
                                    </span>
                                )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                {draftItems.length === 0 && (
                                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                                        No items added yet.
                                    </div>
                                )}
                                {draftItems.map((item, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 rounded border bg-card text-sm">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="outline">#{item.taskId}</Badge>
                                            <span className="font-medium">{item.taskName}</span>
                                            {(item.label || item.siteId) && (
                                                <span className="text-muted-foreground">
                                                    ({[item.siteId, item.label].filter(Boolean).join(', ')})
                                                </span>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                            onClick={() => removeFromDraft(idx)}
                                        >
                                            <Trash className="w-4 h-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t mt-auto">
                        <Button variant="outline" onClick={() => setIsOpen(false)}>Cancel</Button>
                        <Button
                            onClick={() => setIsReviewOpen(true)}
                            disabled={draftItems.length === 0 || draftItems.length > 50}
                        >
                            Review & Save
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Review Modal */}
            <BulkReviewModal
                isOpen={isReviewOpen}
                onClose={() => setIsReviewOpen(false)}
                onConfirm={handleConfirm}
                items={draftItems}
                isSubmitting={mutation.isPending}
                existingScheduleTaskIds={existingTaskIds}
            />
        </>
    );
}
