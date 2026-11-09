import { JobRunner } from './job-runner.service';
import { JOB_DEFINITIONS } from './job-definitions';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { UniqueDelivery } from '../notifications/unique-delivery';
import { endOfDay, format, startOfDay, subDays } from 'date-fns';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from '../tasks/instance.service';
import { loadPlanningContext } from '../tasks/planning-context';

const DEF = JOB_DEFINITIONS['audit-producer'];

@Injectable()
export class AuditScheduler {
  private readonly logger = new Logger(AuditScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly instanceService: InstanceService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly notificationsService: NotificationsService,
    private readonly runner: JobRunner,
  ) {
    this.runner.register(DEF, () => this.work());
  }

  @Cron(DEF.cron, { name: DEF.name })
  auditMissedInstances() {
    return this.runner.run(DEF.name, 'cron');
  }

  async work() {
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
      // Skipped or moved occurrences: without them a skipped day is marked MISSING
      // and sends a false "missed task" alert.
      include: {
        overrides: {
          where: {
            OR: [
              { originalDate: { gte: auditStart, lte: auditEnd } },
              { targetDate: { gte: auditStart, lte: auditEnd } },
            ],
          },
        },
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
      select: { taskId: true, instanceDate: true, status: true },
    });
    const statusDatesByTask = new Map<number, Set<string>>();
    for (const s of existingStatuses) {
      const dates = statusDatesByTask.get(s.taskId) ?? new Set<string>();
      dates.add(format(s.instanceDate, 'yyyy-MM-dd'));
      statusDatesByTask.set(s.taskId, dates);
    }

    const delivery = new UniqueDelivery(this.prisma.client);
    const delivered = await delivery.auditReceipts(
      tasks.map((task) => task.id),
    );
    const missing = new Set(
      existingStatuses
        .filter((s) => s.status === 'MISSING')
        .map((s) => `${s.taskId}:${format(s.instanceDate, 'yyyy-MM-dd')}`),
    );
    let missingCount = 0;

    // Optimize: Fetch settings once
    const { countryForSite, windowDefaults, fromCompletion } =
      await loadPlanningContext(this.prisma.client, this.settings);

    for (const task of tasks) {
      const fromCompletionCtx = await fromCompletion(
        task,
        auditStart,
        auditEnd,
      );

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

        if (now <= periodEnd) continue;
        const key = `${task.id}:${dateKey}`;
        if (!statusDates.has(dateKey)) {
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
            statusDates.add(dateKey);
            missing.add(key);
          } catch (error: unknown) {
            if ((error as { code?: string }).code === 'P2002') continue;
            throw error;
          }
        }
        if (missing.has(key) && !delivered.has(key)) {
          await delivery.run(
            task.id,
            { type: 'audit', date: dateKey },
            () =>
              this.notificationsService.dispatchTaskNotifications(
                task.id,
                'OVERDUE',
                {
                  instanceDate: dateKey,
                  deadline: periodEnd,
                  deliveryKey: UniqueDelivery.auditChannelKey(dateKey),
                },
              ),
            true,
          );
          delivered.add(key);
        }
      }
    }

    // Always logged, so the cost of this 5-minute job can be followed over time.
    this.logger.log(
      `Audit completed in ${Date.now() - startedAt} ms: ${tasks.length} tasks, ${missingCount} instances marked MISSING.`,
    );
  }
}
