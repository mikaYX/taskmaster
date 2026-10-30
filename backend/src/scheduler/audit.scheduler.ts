import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from '../tasks/instance.service';
import { loadSiteCountryResolver } from '../sites/site-country';

@Injectable()
export class AuditScheduler {
  private readonly logger = new Logger(AuditScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'audit-producer' })
  async auditMissedInstances() {
    this.logger.log('Starting Audit of Missed Instances...');

    const now = new Date();
    const startedAt = Date.now();
    const auditStart = subDays(startOfDay(now), 90); // Look back 90 days max
    // Inclure aujourd'hui pour que les tâches dont la fenêtre est dépassée (ex. 18h) passent en MISSING
    const auditEnd = endOfDay(now);

    const tasks = await this.prisma.client.task.findMany({
      where: {
        deletedAt: null,
        OR: [{ activeUntil: null }, { activeUntil: { gte: auditStart } }],
      },
    });

    if (tasks.length === 0) {
      this.logger.log('Audit completed: no task to audit.');
      return;
    }

    // Fetch every existing status of the window at once, keyed by task then YYYY-MM-DD.
    const existingStatuses = await this.prisma.client.status.findMany({
      where: {
        taskId: { in: tasks.map((task) => task.id) },
        instanceDate: { gte: auditStart, lte: auditEnd },
      },
      select: { taskId: true, instanceDate: true },
    });
    const statusDatesByTask = new Map<number, Set<string>>();
    for (const s of existingStatuses) {
      const dates = statusDatesByTask.get(s.taskId) ?? new Set<string>();
      dates.add(format(s.instanceDate, 'yyyy-MM-dd'));
      statusDatesByTask.set(s.taskId, dates);
    }

    let missingCount = 0;

    // Optimize: Fetch settings once
    const [defaultCountry, fcEnabled, wStart, wEnd, alertsEnabled] =
      await Promise.all([
        this.settings.getRawValue<string>('app.country'),
        this.settings.getRawValue<boolean>('FROM_COMPLETION_ENABLED'),
        this.settings.getRawValue<string>('SCHEDULE_DEFAULT_START_TIME'),
        this.settings.getRawValue<string>('SCHEDULE_DEFAULT_END_TIME'),
        this.settings.getRawValue<boolean>('email.alerts.missingTasks'),
      ]);
    const countryForSite = await loadSiteCountryResolver(
      this.prisma.client,
      defaultCountry || 'FR',
    );
    const windowDefaults = { start: wStart || '08:00', end: wEnd || '18:00' };

    for (const task of tasks) {
      const t = task as any;
      let fromCompletionCtx:
        import('../tasks/instance.service').FromCompletionContext | undefined;

      if (fcEnabled && t.recurrenceMode === 'FROM_COMPLETION' && t.rrule) {
        const lastTerminal = await this.prisma.client.status.findFirst({
          where: {
            taskId: task.id,
            status: { in: ['SUCCESS', 'FAILED'] },
          },
          orderBy: { updatedAt: 'desc' },
        });

        const hasRunning =
          (await this.prisma.client.status.count({
            where: {
              taskId: task.id,
              status: 'RUNNING',
              instanceDate: { gte: auditStart, lte: auditEnd },
            },
          })) > 0;

        fromCompletionCtx = {
          lastTerminalDate: lastTerminal?.updatedAt ?? null,
          hasRunningInstance: hasRunning,
        };
      }

      const virtuals = this.instanceService.computeInstances(
        task,
        auditStart,
        auditEnd,
        countryForSite(task.siteId),
        fromCompletionCtx,
        windowDefaults,
      );

      const statusDates = statusDatesByTask.get(task.id) ?? new Set<string>();

      // Compare
      for (const v of virtuals) {
        const dateKey = format(v.date, 'yyyy-MM-dd');
        const periodEnd =
          v.periodEnd || new Date(new Date(v.date).setHours(23, 59, 59, 999));

        if (!statusDates.has(dateKey) && now > periodEnd) {
          // Persist as MISSING

          try {
            await this.prisma.client.status.create({
              data: {
                taskId: task.id,
                instanceDate: v.date,
                status: 'MISSING',
                comment: 'Auto-detected as missing by Audit',
              },
            });
            missingCount++;
            if (alertsEnabled) {
              this.notificationsService
                .dispatchTaskNotifications(task.id, 'OVERDUE', {
                  instanceDate: dateKey,
                })
                .catch((err: unknown) => {
                  this.logger.error(
                    `Failed to dispatch OVERDUE notification for task ${task.id}`,
                    err,
                  );
                });
            }
          } catch (error: any) {
            // Ignore unique constraint violation (P2002) - race condition or already exists
            if (error.code !== 'P2002') {
              this.logger.error(
                `Failed to create missing status for task ${task.id} on ${dateKey}`,
                error,
              );
            }
          }
        }
      }
    }

    // Always logged, so the cost of this 5-minute job can be followed over time.
    this.logger.log(
      `Audit completed in ${Date.now() - startedAt} ms: ${tasks.length} tasks, ${missingCount} instances marked MISSING.`,
    );
  }
}
