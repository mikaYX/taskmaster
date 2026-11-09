import { endOfDay, format, startOfDay } from 'date-fns';
import { InstanceService } from '../../tasks/instance.service';
import { SettingsService } from '../../settings/settings.service';
import { loadPlanningContext } from '../../tasks/planning-context';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UniqueDelivery } from '../../notifications/unique-delivery';
import type { SchedulerJob, JobExecutionResult } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { NotificationsService } from '../../notifications/notifications.service';
import { JobLockService } from '../job-lock.service';

@Injectable()
export class MissingTasksNotificationJob implements SchedulerJob {
  readonly name = 'email-alerts';
  readonly cron = '0 * * * *'; // Every hour

  private readonly logger = new Logger(MissingTasksNotificationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly jobLock: JobLockService,
    private readonly instanceService: InstanceService,
    private readonly settings: SettingsService,
  ) {}

  @Cron('0 * * * *', { name: 'email-alerts' })
  async execute(): Promise<JobExecutionResult> {
    return this.jobLock.withLock(this.name, async () => {
      this.logger.log('Checking for overdue task notifications...');

      const now = new Date();

      // Same 90-day look-back as the MISSING audit; archived tasks never alert.
      const lookBack = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      const runningStatuses = await this.prisma.client.status.findMany({
        where: {
          status: 'RUNNING',
          instanceDate: { gte: lookBack },
          task: { deletedAt: null },
        },
        include: {
          task: {
            include: { overrides: true },
          },
        },
      });

      const overdueTaskIds = new Set<number>();

      const { countryForSite, windowDefaults, fromCompletion } =
        await loadPlanningContext(this.prisma.client, this.settings);
      for (const status of runningStatuses) {
        const rangeStart = startOfDay(status.instanceDate);
        const rangeEnd = endOfDay(status.instanceDate);
        const task = status.task;
        const context = await fromCompletion(task, rangeStart, rangeEnd);
        for (const instance of this.instanceService.computeInstances(
          task,
          rangeStart,
          rangeEnd,
          countryForSite(task.siteId),
          context,
          windowDefaults,
        )) {
          if (
            format(instance.date, 'yyyy-MM-dd') ===
              format(status.instanceDate, 'yyyy-MM-dd') &&
            instance.periodEnd &&
            instance.periodEnd < now
          ) {
            overdueTaskIds.add(status.taskId);
          }
        }
      }

      const delivery = new UniqueDelivery(this.prisma.client);
      const recentlyNotified = await delivery.recentOverdue([
        ...overdueTaskIds,
      ]);
      for (const taskId of overdueTaskIds) {
        if (recentlyNotified.has(taskId)) continue;
        await delivery.run(
          taskId,
          { type: 'overdue' },
          () =>
            this.notificationsService.dispatchTaskNotifications(
              taskId,
              'OVERDUE',
              {
                deliveryKey: 'hourly',
              },
            ),
          true,
        );
      }

      if (overdueTaskIds.size > 0) {
        this.logger.log(`Dispatched OVERDUE notifications for missing tasks`);
      }
    });
  }
}
