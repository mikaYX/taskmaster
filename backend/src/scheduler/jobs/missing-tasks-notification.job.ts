import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { NotificationsService } from '../../notifications/notifications.service';
import { SettingsService } from '../../settings';
import { JobLockService } from '../job-lock.service';

@Injectable()
export class MissingTasksNotificationJob implements SchedulerJob {
  readonly name = 'email-alerts';
  readonly cron = '0 * * * *'; // Every hour

  private readonly logger = new Logger(MissingTasksNotificationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly settingsService: SettingsService,
    private readonly jobLock: JobLockService,
  ) {}

  @Cron('0 * * * *', { name: 'email-alerts' })
  async execute(): Promise<void> {
    await this.jobLock.withLock(this.name, async () => {
      this.logger.log('Checking for overdue task notifications...');

      const alertsEnabled = await this.settingsService.getRawValue<boolean>(
        'email.alerts.missingTasks',
      );
      if (alertsEnabled === false) {
        this.logger.log(
          'email.alerts.enabled is false, skipping missing tasks check.',
        );
        return;
      }

      const now = new Date();
      const deduplicationWindow = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24h

      const runningStatuses = await this.prisma.client.status.findMany({
        where: {
          status: 'RUNNING',
        },
        include: {
          task: {
            select: { dueOffset: true },
          },
        },
      });

      const overdueTaskIds = new Set<number>();

      for (const status of runningStatuses) {
        const offsetMs = (status.task.dueOffset || 0) * 60000;
        const deadline = new Date(status.instanceDate.getTime() + offsetMs);

        if (deadline < now) {
          overdueTaskIds.add(status.taskId);
        }
      }

      // Deduplication Check
      for (const taskId of overdueTaskIds) {
        const recentNotif = await this.prisma.client.notification.findFirst({
          where: {
            taskId,
            kind: 'OVERDUE',
            sentAt: { gte: deduplicationWindow },
          },
        });

        if (recentNotif) {
          continue; // Skip if already notified in window
        }

        await this.prisma.client.notification.create({
          data: {
            taskId,
            kind: 'OVERDUE',
            sentAt: now,
          },
        });

        this.notificationsService
          .dispatchTaskNotifications(taskId, 'OVERDUE')
          .catch((err: unknown) => {
            this.logger.error(
              `Failed to dispatch OVERDUE notification for task ${taskId}`,
              err,
            );
          });
      }

      if (overdueTaskIds.size > 0) {
        this.logger.log(`Dispatched OVERDUE notifications for missing tasks`);
      }
    });
  }
}
