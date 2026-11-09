import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UniqueDelivery } from '../../notifications/unique-delivery';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import type { SchedulerJob, JobExecutionResult } from '../scheduler.interface';
import { JobLockService } from '../job-lock.service';
import { PrismaService } from '../../prisma';
import { SettingsService } from '../../settings/settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { InstanceService } from '../../tasks/instance.service';
import { loadPlanningContext } from '../../tasks/planning-context';

const INTERVAL_MS = 15 * 60_000; // match cron interval
/** A yearly occurrence can start long before its deadline. */
const LOOK_BACK_DAYS = 366;

@Injectable()
export class ReminderNotificationJob implements SchedulerJob {
  readonly name = 'email-reminders';
  readonly cron = '*/15 * * * *'; // Every 15 minutes

  private readonly logger = new Logger(ReminderNotificationJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly instanceService: InstanceService,
    private readonly jobLock: JobLockService,
  ) {}

  @Cron('*/15 * * * *', { name: 'email-reminders' })
  async execute(): Promise<JobExecutionResult> {
    return this.jobLock.withLock(this.name, () => this.sendDueReminders());
  }

  private async sendDueReminders(): Promise<void> {
    const rows = await this.prisma.client.taskNotification.findMany({
      where: {
        notifyOnReminder: true,
        channel: { enabled: true },
        task: { deletedAt: null },
      },
      select: {
        id: true,
        taskId: true,
        reminderOffsetMinutes: true,
        task: { include: { overrides: true } },
      },
    });
    if (rows.length === 0) return;

    const now = new Date();
    // Rounded so that the windows of two runs meet exactly: no gap, no overlap.
    const tick = Math.floor(now.getTime() / INTERVAL_MS) * INTERVAL_MS;
    const rangeStart = subDays(startOfDay(now), LOOK_BACK_DAYS);
    const longestOffset = Math.max(
      ...rows.map((row) => row.reminderOffsetMinutes),
    );
    const rangeEnd = endOfDay(new Date(tick + longestOffset * 60_000));

    const tasks = new Map(rows.map((row) => [row.taskId, row.task]));

    // A RUNNING occurrence still has to be finished: only a closed one needs no reminder.
    const closedStatuses = await this.prisma.client.status.findMany({
      where: {
        taskId: { in: [...tasks.keys()] },
        instanceDate: { gte: rangeStart, lte: rangeEnd },
        status: { not: 'RUNNING' },
      },
      select: { taskId: true, instanceDate: true },
    });
    const closedDates = new Set(
      closedStatuses.map(
        (s) => `${s.taskId}:${format(s.instanceDate, 'yyyy-MM-dd')}`,
      ),
    );

    const { countryForSite, windowDefaults, fromCompletion } =
      await loadPlanningContext(this.prisma.client, this.settings);

    // Same schedule as the audit, so the reminder and the missed-task alert agree on the deadline.
    const openByTask = new Map<number, { date: string; deadline: Date }[]>();
    for (const [taskId, task] of tasks) {
      const fromCompletionCtx = await fromCompletion(
        task,
        rangeStart,
        rangeEnd,
      );

      const open: { date: string; deadline: Date }[] = [];
      for (const instance of this.instanceService.computeInstances(
        task,
        rangeStart,
        rangeEnd,
        countryForSite(task.siteId),
        fromCompletionCtx,
        windowDefaults,
      )) {
        const date = format(instance.date, 'yyyy-MM-dd');
        if (instance.periodEnd && !closedDates.has(`${taskId}:${date}`)) {
          open.push({ date, deadline: instance.periodEnd });
        }
      }
      openByTask.set(taskId, open);
    }

    const delivery = new UniqueDelivery(this.prisma.client);
    let dispatched = 0;
    for (const row of rows) {
      const windowEnd = tick + row.reminderOffsetMinutes * 60_000;
      const windowStart = windowEnd - INTERVAL_MS;

      for (const { date, deadline } of openByTask.get(row.taskId) ?? []) {
        const time = deadline.getTime();
        if (time <= windowStart || time > windowEnd) continue;

        try {
          const sent = await delivery.run(
            row.taskId,
            {
              type: 'reminder',
              notificationId: row.id,
              date,
              deadline,
            },
            () =>
              this.notificationsService.dispatchTaskNotifications(
                row.taskId,
                'REMINDER',
                {
                  notificationId: row.id,
                  instanceDate: date,
                  deadline,
                  awaitDelivery: true,
                },
              ),
          );
          if (sent) dispatched++;
        } catch (err: unknown) {
          this.logger.error(
            `Failed to dispatch REMINDER notification for task ${row.taskId}`,
            err,
          );
        }
      }
    }

    if (dispatched > 0) {
      this.logger.log(`Dispatched ${dispatched} REMINDER notification(s)`);
    }
  }
}
