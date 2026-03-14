import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma';
import { InstanceService } from '../tasks/instance.service';
import { TasksService } from '../tasks/tasks.service'; // IDE Sync
import { addDays, subDays, startOfDay, endOfDay, isBefore, format } from 'date-fns';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AuditScheduler {
  private readonly logger = new Logger(AuditScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly notificationsService: NotificationsService,
  ) { }

  @Cron(CronExpression.EVERY_5_MINUTES, { name: 'audit-producer' })
  async auditMissedInstances() {
    this.logger.log('Starting Audit of Missed Instances...');

    const now = new Date();
    const auditStart = subDays(startOfDay(now), 90); // Look back 90 days max
    // Inclure aujourd'hui pour que les tâches dont la fenêtre est dépassée (ex. 18h) passent en MISSING
    const auditEnd = endOfDay(now);

    const tasks = await this.prisma.client.task.findMany({
      where: {
        OR: [{ activeUntil: null }, { activeUntil: { gte: auditStart } }],
      },
    });

    let missingCount = 0;

    // Optimize: Fetch settings once
    const [defaultCountry, fcEnabled, wStart, wEnd] = await Promise.all([
      this.settings.getRawValue<string>('app.country'),
      this.settings.getRawValue<boolean>('FROM_COMPLETION_ENABLED'),
      this.settings.getRawValue<string>('SCHEDULE_DEFAULT_START_TIME'),
      this.settings.getRawValue<string>('SCHEDULE_DEFAULT_END_TIME'),
    ]);
    const country = defaultCountry || 'FR';
    const windowDefaults = { start: wStart || '08:00', end: wEnd || '18:00' };

    for (const task of tasks) {
      const t = task as any;
      let fromCompletionCtx:
        | import('../tasks/instance.service').FromCompletionContext
        | undefined;

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
        country,
        fromCompletionCtx,
        windowDefaults,
      );

      // Fetch Real Statuses
      const statuses = await this.prisma.client.status.findMany({
        where: {
          taskId: task.id,
          instanceDate: {
            gte: auditStart,
            lte: auditEnd,
          },
        },
      });

      // Map statuses by date string YYYY-MM-DD
      const statusMap = new Map(
        statuses.map((s) => [format(s.instanceDate, 'yyyy-MM-dd'), s.status]),
      );

      // Compare
      for (const v of virtuals) {
        const dateKey = format(v.date, 'yyyy-MM-dd');
        const periodEnd =
          v.periodEnd || new Date(new Date(v.date).setHours(23, 59, 59, 999));

        if (!statusMap.has(dateKey) && now > periodEnd) {
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

    if (missingCount > 0) {
      this.logger.log(
        `Audit completed. Marked ${missingCount} instances as MISSING.`,
      );
    }
  }
}
