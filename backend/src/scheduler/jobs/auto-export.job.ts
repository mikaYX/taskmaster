import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import cronParser from 'cron-parser';
import type { SchedulerJob } from '../scheduler.interface';
import { ExportService } from '../../backup/export.service';
import { SettingsService } from '../../settings';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  AuditAction,
  AuditCategory,
  AuditSeverity,
} from '../../audit/audit.constants';

/**
 * Auto Export Job.
 *
 * Runs a business data export based on configured schedule.
 * Since the schedule is dynamic (user configured), this job runs every minute
 * and checks if it matches the user's configuration.
 */
@Injectable()
export class AutoExportJob implements SchedulerJob {
  readonly name = 'auto-export';
  readonly cron = '* * * * *'; // Run every minute to check schedule

  private readonly logger = new Logger(AutoExportJob.name);

  constructor(
    private readonly exportService: ExportService,
    private readonly settings: SettingsService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('* * * * *', { name: 'auto-export' })
  async execute(): Promise<void> {
    // 1. Check if enabled
    let enabled = await this.settings.getRawValue<boolean>(
      'export.autoExport.enabled',
    );
    if (enabled ?? true) {
      if (enabled === undefined || enabled === null) {
        this.logger.log(
          '[auto-export] Enabled dynamically by fallback to true (Prod v1 default)',
        );
        enabled = true;
      }
    }
    if (!enabled) return;

    // 2. Get Schedule Config
    const scheduleType =
      (await this.settings.getRawValue<string>(
        'export.autoExport.scheduleType',
      )) ?? 'daily';
    const dayOfWeek =
      (await this.settings.getRawValue<number>(
        'export.autoExport.dayOfWeek',
      )) ?? 1;
    const dayOfMonth =
      (await this.settings.getRawValue<number>(
        'export.autoExport.dayOfMonth',
      )) ?? 1;
    const monthMode =
      (await this.settings.getRawValue<string>(
        'export.autoExport.monthMode',
      )) ?? 'specific';
    const weekOrdinal =
      (await this.settings.getRawValue<string>(
        'export.autoExport.weekOrdinal',
      )) ?? 'first';
    const rawCustomCron =
      (await this.settings.getRawValue<string>('export.autoExport.cron')) ||
      '0 0 * * *';

    // 3. Compare with Current Time
    const now = new Date();
    const currentHours = now.getHours().toString().padStart(2, '0');
    const currentMinutes = now.getMinutes().toString().padStart(2, '0');

    let shouldRun = false;

    if (scheduleType === 'custom') {
      shouldRun = this.shouldRunCustomCron(rawCustomCron, now);
    } else {
      // Standard Schedules: Daily, Weekly, Monthly
      // We need a reference time. Since there is no 'export.autoExport.time' in registry, we default to 00:00 (Midnight).
      // FIXME(Prod V1) : Le système est forcé chaque jour à Minuit (00h00) mais nous recommandons d'exécuter l'export auto en fin de cycle, via une interface Configuration.
      if (currentHours === '00' && currentMinutes === '00') {
        if (scheduleType === 'daily') {
          shouldRun = true;
        } else if (scheduleType === 'weekly') {
          if (now.getDay() === dayOfWeek) shouldRun = true;
        } else if (scheduleType === 'monthly') {
          shouldRun = this.isMonthlyScheduleMatch({
            now,
            monthMode,
            dayOfMonth,
            dayOfWeek,
            weekOrdinal,
          });
        }
      }
    }

    if (!shouldRun) return;

    // 4. Run Export
    this.logger.log(
      `[${this.name}] Schedule matched (Type: ${scheduleType}). Starting export...`,
    );
    const start = Date.now();

    try {
      const formats = (await this.settings.getRawValue<string[]>(
        'export.autoExport.formats',
      )) || ['csv'];
      // We usually export CSV or JSON. The export service supports 'json' | 'csv'.
      const format = formats.includes('csv') ? 'csv' : 'json';

      const resultPath = await this.exportService.generateExport({
        format: format,
        encrypt: false, // Auto-exports usually unencrypted in local folder unless specified otherwise
      });

      const duration = Date.now() - start;
      this.logger.log(
        `[${this.name}] Job completed: Created ${resultPath} (${duration}ms)`,
      );

      await this.auditService.log({
        action: AuditAction.SYSTEM_EXPORT_SUCCESS,
        category: AuditCategory.SYSTEM,
        actorId: undefined,
        actorName: 'System (AutoExport)',
        target: 'Export',
        details: { path: resultPath, duration },
        severity: AuditSeverity.INFO,
      });

      // 5. Send Email if enabled
      const emailEnabled = await this.settings.getRawValue<boolean>(
        'export.autoExport.email.enabled',
      );
      if (emailEnabled) {
        try {
          const recipients = new Set<string>();
          const customEmails =
            (await this.settings.getRawValue<string[]>(
              'export.autoExport.email.customEmails',
            )) || [];
          customEmails.forEach((e) => recipients.add(e));

          const userIds =
            (await this.settings.getRawValue<number[]>(
              'export.autoExport.email.recipients',
            )) || [];
          if (userIds.length > 0) {
            const users = await this.prisma.client.user.findMany({
              where: {
                id: { in: userIds },
                deletedAt: null,
                email: { not: null },
              },
              select: { email: true },
            });
            users.forEach((u) => u.email && recipients.add(u.email));
          }

          if (recipients.size > 0) {
            const dateStr = new Date().toLocaleDateString('fr-FR');
            const subject = `[Taskmaster] Automated Export - ${dateStr}`;
            const messageText = `L'export automatique du ${dateStr} a été généré avec succès.\nVous pouvez le télécharger depuis la page des paramètres d'export du système.`;
            const messageHtml = `<div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #333;">Export Automatique - ${dateStr}</h2>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin-top: 15px;">
                  <p>L'export périodique a été généré avec succès.</p>
                  <p>Période couverte : Jusqu'au ${dateStr}</p>
                  <p><strong>Action requise :</strong> Vous pouvez télécharger ce fichier directement depuis la page <em>Settings > Exports</em> de l'application.</p>
                </div>
              </div>`;

            await this.emailService.send({
              to: Array.from(recipients),
              subject,
              html: messageHtml,
              text: messageText,
            });
            this.logger.log(
              `[${this.name}] Export email notification sent to ${recipients.size} recipient(s).`,
            );
          }
        } catch (emailError) {
          this.logger.error(
            `[${this.name}] Failed to send export email notification`,
            emailError,
          );
        }
      }
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`[${this.name}] Job failed after ${duration}ms`, error);

      await this.auditService.log({
        action: AuditAction.SYSTEM_EXPORT_FAILURE,
        category: AuditCategory.SYSTEM,
        actorId: undefined,
        actorName: 'System (AutoExport)',
        target: 'Export',
        details: { error: error.message, duration },
        severity: AuditSeverity.ERROR,
      });
    }
  }

  private shouldRunCustomCron(expression: string, now: Date): boolean {
    try {
      const interval = cronParser.parse(expression);
      const previous = interval.prev();
      const previousDate = previous.toDate();
      const diff = Math.abs(now.getTime() - previousDate.getTime());
      return diff < 60_000;
    } catch {
      this.logger.error(
        `[${this.name}] Invalid cron expression: ${expression}`,
      );
      return false;
    }
  }

  private isMonthlyScheduleMatch(params: {
    now: Date;
    monthMode: string;
    dayOfMonth: number;
    dayOfWeek: number;
    weekOrdinal: string;
  }): boolean {
    const { now, monthMode, dayOfMonth, dayOfWeek, weekOrdinal } = params;

    if (monthMode === 'last') {
      const lastDayOfMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
      ).getDate();
      return now.getDate() === lastDayOfMonth;
    }

    if (monthMode === 'relative') {
      return this.isWeekOrdinalDayMatch(now, dayOfWeek, weekOrdinal);
    }

    const lastDayOfMonth = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
    ).getDate();
    const safeDay = Math.min(Math.max(dayOfMonth, 1), lastDayOfMonth);
    return now.getDate() === safeDay;
  }

  private isWeekOrdinalDayMatch(
    date: Date,
    dayOfWeek: number,
    weekOrdinal: string,
  ): boolean {
    if (date.getDay() !== dayOfWeek) {
      return false;
    }

    const year = date.getFullYear();
    const month = date.getMonth();
    const matchingDays: number[] = [];
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const candidate = new Date(year, month, day);
      if (candidate.getDay() === dayOfWeek) {
        matchingDays.push(day);
      }
    }

    if (matchingDays.length === 0) {
      return false;
    }

    if (weekOrdinal === 'last') {
      return date.getDate() === matchingDays[matchingDays.length - 1];
    }

    const ordinalIndex: Record<string, number> = {
      first: 0,
      second: 1,
      third: 2,
      fourth: 3,
    };
    const index = ordinalIndex[weekOrdinal] ?? 0;
    return date.getDate() === matchingDays[index];
  }
}
