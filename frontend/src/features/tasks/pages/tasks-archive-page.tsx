import { useQuery, useQueryClient } from "@tanstack/react-query";
import { tasksApi } from "@/api/tasks";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { getDateLocale } from "@/lib/date-locale";

import type { Task } from "@/api/types";

export function TasksArchivePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["tasks", "archived"],
    queryFn: () => tasksApi.getArchivedTasks(),
  });

  const handleRestore = async (taskId: number) => {
    try {
      await tasksApi.restoreTask(taskId);
      toast.success(t("taskArchive.restored"));
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    } catch (error) {
      console.error("Failed to restore task:", error);
      toast.error(t("taskArchive.restoreFailed"));
    }
  };

  return (
    <div className="container py-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{t("taskArchive.title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("taskArchive.description")}
          </p>
        </div>
        <Badge variant="secondary" className="px-3 py-1 text-sm">
          {t("taskArchive.count", { n: data?.length || 0 })}
        </Badge>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground animate-pulse">
          {t("taskArchive.loading")}
        </div>
      ) : data?.length === 0 ? (
        <div className="text-center py-12 border rounded-lg bg-muted/20">
          <Archive className="mx-auto h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="font-semibold text-lg">{t("taskArchive.emptyTitle")}</h3>
          <p className="mt-2 text-muted-foreground">
            {t("taskArchive.emptyBody")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {data?.map((task: Task) => (
            <Card
              key={task.id}
              className="p-4 hover:bg-muted/30 transition-colors"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{task.name}</h3>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground mt-1">
                    <span className="capitalize">
                      {t("taskArchive.periodicity", {
                        periodicity: t(`taskWizard.periodicities.${String(task.periodicity).toLowerCase()}.label`, { defaultValue: task.periodicity }),
                      })}
                    </span>
                    {task.deletedAt && (
                      <span>
                        {t("taskArchive.deleted", {
                          when: formatDistanceToNow(new Date(task.deletedAt), {
                            addSuffix: true,
                            locale: getDateLocale(),
                          }),
                        })}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleRestore(task.id)}
                  className="shrink-0"
                >
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t("taskArchive.restore")}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
