import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { SettingsService } from '../../settings/settings.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class ReminderNotificationJob implements SchedulerJob {
  readonly name = 'email-reminders';
  readonly cron = '*/15 * * * *'; // Every 15 minutes

  private readonly logger = new Logger(ReminderNotificationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('*/15 * * * *', { name: 'email-reminders' })
  async execute(): Promise<void> {
    const enabled = await this.settings.getRawValue<boolean>(
      'email.reminders.enabled',
    );
    if (!enabled) return;

    const offsetHours = Number(
      (await this.settings.getRawValue<number>(
        'email.reminders.offsetHours',
      )) || 1,
    );
    const offsetMins = Number(
      (await this.settings.getRawValue<number>(
        'email.reminders.offsetMinutes',
      )) || 0,
    );
    const offsetMs = (offsetHours * 60 + offsetMins) * 60_000;
    const windowMs = 15 * 60_000; // match cron interval

    const now = new Date();
    const reminderWindowStart = new Date(now.getTime() + offsetMs - windowMs);
    const reminderWindowEnd = new Date(now.getTime() + offsetMs);

    // Target RUNNING tasks whose instanceDate falls inside the upcoming reminder window
    const upcoming = await this.prisma.client.status.findMany({
      where: {
        status: 'RUNNING',
        instanceDate: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd,
        },
      },
      select: { taskId: true },
      distinct: ['taskId'],
    });

    for (const { taskId } of upcoming) {
      this.notificationsService
        .dispatchTaskNotifications(taskId, 'REMINDER')
        .catch((err: unknown) => {
          this.logger.error(
            `Failed to dispatch REMINDER notification for task ${taskId}`,
            err,
          );
        });
    }

    if (upcoming.length > 0) {
      this.logger.log(
        `Dispatched REMINDER notifications for ${upcoming.length} tasks`,
      );
    }
  }
}
