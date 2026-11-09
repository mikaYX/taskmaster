import { JobRunner } from '../job-runner.service';
import { JOB_DEFINITIONS } from '../job-definitions';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { BackupService } from '../../backup';
import { AuditService } from '../../audit/audit.service';
import {
  AuditAction,
  AuditCategory,
  AuditSeverity,
} from '../../audit/audit.constants';

/**
 * Cleanup Backups Job.
 *
 * Removes expired backup files.
 * Runs daily at 3:00 AM.
 */
const DEF = JOB_DEFINITIONS['cleanup-backups'];

@Injectable()
export class CleanupBackupsJob implements SchedulerJob {
  readonly name = DEF.name;
  readonly cron = DEF.cron; // Daily at 3:00 AM

  private readonly logger = new Logger(CleanupBackupsJob.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly auditService: AuditService,
    private readonly runner: JobRunner,
  ) {
    this.runner.register(DEF, () => this.execute());
  }

  @Cron(DEF.cron, { name: DEF.name })
  handleCron() {
    return this.runner.run(DEF.name, 'cron');
  }

  async execute(): Promise<void> {
    const start = Date.now();
    this.logger.log(`[${this.name}] Job started`);

    try {
      const deletedCount = await this.backupService.cleanupExpired();
      const duration = Date.now() - start;

      if (deletedCount > 0) {
        await this.auditService.log({
          action: AuditAction.SYSTEM_CLEANUP_SUCCESS,
          category: AuditCategory.SYSTEM,
          actorId: undefined,
          actorName: 'System (CleanupBackups)',
          target: 'Backups',
          details: { deletedCount, duration },
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
        actorName: 'System (CleanupBackups)',
        target: 'Backups',
        details: { error: error.message, duration },
        severity: AuditSeverity.ERROR,
      });
      throw error;
    }
  }
}
