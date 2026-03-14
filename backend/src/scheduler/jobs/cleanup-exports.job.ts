import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { ExportService } from '../../backup/export.service';
import { AuditService } from '../../audit/audit.service';
import { SettingsService } from '../../settings';
import {
  AuditAction,
  AuditCategory,
  AuditSeverity,
} from '../../audit/audit.constants';

/**
 * Cleanup Exports Job.
 *
 * Removes expired export files.
 * Runs daily at 2:00 AM.
 */
@Injectable()
export class CleanupExportsJob implements SchedulerJob {
  readonly name = 'cleanup-exports';
  readonly cron = '0 2 * * *'; // Daily at 2:00 AM

  private readonly logger = new Logger(CleanupExportsJob.name);

  constructor(
    private readonly exportService: ExportService,
    private readonly settingsService: SettingsService,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 2 * * *', { name: 'cleanup-exports' })
  async execute(): Promise<void> {
    const start = Date.now();
    this.logger.log(`[${this.name}] Job started`);

    try {
      const retentionDays =
        (await this.settingsService.getRawValue<number>(
          'export.retention.days',
        )) ?? 30;
      const deletedCount =
        await this.exportService.cleanupExpired(retentionDays);
      const duration = Date.now() - start;

      if (deletedCount > 0) {
        await this.auditService.log({
          action: AuditAction.SYSTEM_CLEANUP_SUCCESS,
          category: AuditCategory.SYSTEM,
          actorId: undefined,
          actorName: 'System (CleanupKeywords)',
          target: 'Exports',
          details: { deletedCount, duration, retentionDays },
          severity: AuditSeverity.INFO,
        });
      }

      this.logger.log(
        `[${this.name}] Job completed: ${deletedCount} files deleted (${duration}ms)`,
      );
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(`[${this.name}] Job failed after ${duration}ms`, error);

      await this.auditService.log({
        action: AuditAction.SYSTEM_CLEANUP_FAILURE,
        category: AuditCategory.SYSTEM,
        actorId: undefined,
        actorName: 'System (CleanupKeywords)',
        target: 'Exports',
        details: { error: error.message, duration },
        severity: AuditSeverity.ERROR,
      });
    }
  }
}
