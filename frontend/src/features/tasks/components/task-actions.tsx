import { useState } from "react";
import {
  MoreHorizontal,
  Pencil,
  Users,
  Power,
  PowerOff,
  CalendarClock,
  Trash2,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Task } from "@/api/types";
import { useDeactivateTask, useReactivateTask } from "@/hooks/use-tasks";
import { toast } from "sonner";
import { DeleteTaskDialog } from "./delete-task-dialog";

interface TaskActionsProps {
  task: Task;
  onEdit: (task: Task) => void;
  onManageAssignments: (task: Task) => void;
  onManageDelegations: (task: Task) => void;
}

/**
 * Task row actions dropdown.
 */
export function TaskActions({
  task,
  onEdit,
  onManageAssignments,
  onManageDelegations,
}: TaskActionsProps) {
  const queryClient = useQueryClient();
  const [showDeactivateAlert, setShowDeactivateAlert] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deactivateTask = useDeactivateTask();
  const reactivateTask = useReactivateTask();

  const handleDeactivate = () => {
    deactivateTask.mutate(task.id, {
      onSuccess: () => {
        toast.success("Task deactivated");
        setShowDeactivateAlert(false);
      },
      onError: () => toast.error("Failed to deactivate task"),
    });
  };

  const handleReactivate = () => {
    reactivateTask.mutate(task.id, {
      onSuccess: () => toast.success("Task reactivated"),
      onError: () => toast.error("Failed to reactivate task"),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onEdit(task)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit Task
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onManageAssignments(task)}>
            <Users className="mr-2 h-4 w-4" />
            Manage Assignments
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onManageDelegations(task)}>
            <CalendarClock className="mr-2 h-4 w-4" />
            Manage Delegations
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {task.isActive ? (
            <DropdownMenuItem
              onClick={() => setShowDeactivateAlert(true)}
              className="text-destructive"
            >
              <PowerOff className="mr-2 h-4 w-4" />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={handleReactivate}>
              <Power className="mr-2 h-4 w-4" />
              Reactivate
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDeactivateAlert}
        onOpenChange={setShowDeactivateAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Task?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the task <strong>{task.name}</strong>. The
              task will no longer appear in the daily schedule but can be
              reactivated later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteTaskDialog
        task={task}
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
      />
    </>
  );
}
