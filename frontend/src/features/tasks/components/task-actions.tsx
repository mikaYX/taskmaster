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
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [showDeactivateAlert, setShowDeactivateAlert] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const deactivateTask = useDeactivateTask();
  const reactivateTask = useReactivateTask();

  const handleDeactivate = () => {
    deactivateTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(t("taskList.actions.deactivated"));
        setShowDeactivateAlert(false);
      },
      onError: () => toast.error(t("taskList.actions.deactivateFailed")),
    });
  };

  const handleReactivate = () => {
    reactivateTask.mutate(task.id, {
      onSuccess: () => toast.success(t("taskList.actions.reactivated")),
      onError: () => toast.error(t("taskList.actions.reactivateFailed")),
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 rounded-lg p-0 text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground">
            <span className="sr-only">{t("taskList.actions.openMenu")}</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60 rounded-xl p-1.5">
          <DropdownMenuLabel className="truncate px-2 text-xs font-normal text-muted-foreground">{task.name}</DropdownMenuLabel>
          <DropdownMenuItem className="gap-2.5 rounded-lg py-2" onClick={() => onEdit(task)}>
            <Pencil className="h-4 w-4 text-primary" />
            {t("tasks.editTask")}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-lg py-2" onClick={() => onManageAssignments(task)}>
            <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            {t("taskList.actions.manageAssignments")}
          </DropdownMenuItem>
          <DropdownMenuItem className="gap-2.5 rounded-lg py-2" onClick={() => onManageDelegations(task)}>
            <CalendarClock className="h-4 w-4 text-orange-600 dark:text-orange-400" />
            {t("taskList.actions.manageDelegations")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {task.isActive ? (
            <DropdownMenuItem
              onClick={() => setShowDeactivateAlert(true)}
              className="gap-2.5 rounded-lg py-2 text-amber-700 focus:text-amber-700 dark:text-amber-400 dark:focus:text-amber-400"
            >
              <PowerOff className="h-4 w-4 text-current" />
              {t("taskList.actions.deactivate")}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className="gap-2.5 rounded-lg py-2" onClick={handleReactivate}>
              <Power className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              {t("taskList.actions.reactivate")}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowDeleteDialog(true)}
            className="gap-2.5 rounded-lg py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 text-current" />
            {t("taskList.actions.deleteTask")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={showDeactivateAlert}
        onOpenChange={setShowDeactivateAlert}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("taskList.actions.deactivateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                i18nKey="taskList.actions.deactivateBody"
                values={{ name: task.name }}
                components={{ strong: <strong /> }}
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("taskList.actions.deactivate")}
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
