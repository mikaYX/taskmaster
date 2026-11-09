import { endOfDay, format, startOfDay } from 'date-fns';
import { InstanceService } from '../../tasks/instance.service';
import { SettingsService } from '../../settings/settings.service';
import { loadSiteCountryResolver } from '../../sites/site-country';
import { loadFromCompletionContext } from '../from-completion-context';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
      const deduplicationWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h

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

      const [country, fcEnabled, start, end] = await Promise.all([
        this.settings.getRawValue<string>('app.country'),
        this.settings.getRawValue<boolean>('FROM_COMPLETION_ENABLED'),
        this.settings.getRawValue<string>('SCHEDULE_DEFAULT_START_TIME'),
        this.settings.getRawValue<string>('SCHEDULE_DEFAULT_END_TIME'),
      ]);
      const countryForSite = await loadSiteCountryResolver(
        this.prisma.client,
        country || 'FR',
      );
      for (const status of runningStatuses) {
        const rangeStart = startOfDay(status.instanceDate);
        const rangeEnd = endOfDay(status.instanceDate);
        const task = status.task;
        const context =
          fcEnabled && task.recurrenceMode === 'FROM_COMPLETION' && task.rrule
            ? await loadFromCompletionContext(
                this.prisma.client,
                status.taskId,
                rangeStart,
                rangeEnd,
              )
            : undefined;
        for (const instance of this.instanceService.computeInstances(
          task,
          rangeStart,
          rangeEnd,
          countryForSite(task.siteId),
          context,
          { start: start || '08:00', end: end || '18:00' },
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

      // Deduplication Check: one query for every overdue task
      const recentlyNotified = new Set(
        overdueTaskIds.size === 0
          ? []
          : (
              await this.prisma.client.notification.findMany({
                where: {
                  taskId: { in: [...overdueTaskIds] },
                  kind: 'OVERDUE',
                  sentAt: { gte: deduplicationWindow },
                },
                select: { taskId: true },
              })
            ).map((n) => n.taskId),
      );

      for (const taskId of overdueTaskIds) {
        if (recentlyNotified.has(taskId)) {
          continue; // Skip if already notified in window
        }

        await this.notificationsService.dispatchTaskNotifications(
          taskId,
          'OVERDUE',
          {
            deliveryKey: 'hourly',
          },
        );
        await this.prisma.client.notification.create({
          data: { taskId, kind: 'OVERDUE', sentAt: new Date() },
        });
      }

      if (overdueTaskIds.size > 0) {
        this.logger.log(`Dispatched OVERDUE notifications for missing tasks`);
      }
    });
  }
}
