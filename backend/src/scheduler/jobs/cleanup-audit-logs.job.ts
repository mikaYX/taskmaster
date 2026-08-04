import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';
import { AuditService } from '../../audit/audit.service';
import {
  AuditAction,
  AuditCategory,
  AuditSeverity,
} from '../../audit/audit.constants';

/**
 * Cleanup Audit Logs Job.
 *
 * Enforces GDPR Art. 5(1)(e) — storage limitation — on the `audit_logs` table.
 * Without this job the table grew unbounded (AUDIT.md Finding #9).
 *
 * Behaviour:
 * - Retention horizon is read from the `AUDIT_LOG_RETENTION_DAYS` env var
 *   (defaults to 365 days). Values ≤ 0 are treated as "disabled" so operators
 *   under regulatory minimum-retention rules can opt out explicitly.
 * - Deletes are issued in batches of `BATCH_SIZE` rows to avoid a long
 *   row-level lock on a hot table during the purge.
 * - Runs at 04:00 local time every day, after the existing cleanup jobs (02:00
 *   exports, 03:00 backups), to spread DB load.
 */
@Injectable()
export class CleanupAuditLogsJob implements SchedulerJob {
  readonly name = 'cleanup-audit-logs';
  readonly cron = '0 4 * * *'; // Daily at 04:00

  /** Number of rows deleted per batch — keeps the per-batch lock window short. */
  private static readonly BATCH_SIZE = 10_000;

  /** Safety cap: at most N batches per run to bound execution time. */
  private static readonly MAX_BATCHES = 100;

  /** Fallback retention when `AUDIT_LOG_RETENTION_DAYS` is unset / invalid. */
  private static readonly DEFAULT_RETENTION_DAYS = 365;

  private readonly logger = new Logger(CleanupAuditLogsJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Cron('0 4 * * *', { name: 'cleanup-audit-logs' })
  async execute(): Promise<void> {
    const start = Date.now();
    const retentionDays = this.resolveRetentionDays();

    if (retentionDays <= 0) {
      this.logger.log(
        `[${this.name}] Disabled (AUDIT_LOG_RETENTION_DAYS=${retentionDays})`,
      );
      return;
    }

    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    this.logger.log(
      `[${this.name}] Starting — cutoff=${cutoff.toISOString()}, ` +
        `retentionDays=${retentionDays}`,
    );

    let totalDeleted = 0;
    let batches = 0;

    try {
      // Iterate one batch at a time so we never hold a long row-level lock.
      // `deleteMany` doesn't support LIMIT in Prisma, so we look up the IDs
      // first and then delete by them. Both queries are bounded by BATCH_SIZE.

      while (true) {
        if (batches >= CleanupAuditLogsJob.MAX_BATCHES) {
          this.logger.warn(
            `[${this.name}] MAX_BATCHES reached (${batches}) — remaining ` +
              `rows will be removed on the next run`,
          );
          break;
        }

        const stale = await this.prisma.client.auditLog.findMany({
          where: { timestamp: { lt: cutoff } },
          take: CleanupAuditLogsJob.BATCH_SIZE,
          select: { id: true },
        });
        if (stale.length === 0) break;

        const { count } = await this.prisma.client.auditLog.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
        totalDeleted += count;
        batches += 1;

        if (count < CleanupAuditLogsJob.BATCH_SIZE) break;
      }

      const duration = Date.now() - start;
      this.logger.log(
        `[${this.name}] Completed — deleted=${totalDeleted}, ` +
          `batches=${batches}, duration=${duration}ms`,
      );

      if (totalDeleted > 0) {
        await this.auditService.log({
          action: AuditAction.SYSTEM_CLEANUP_SUCCESS,
          category: AuditCategory.SYSTEM,
          actorId: undefined,
          actorName: 'System (CleanupAuditLogs)',
          target: 'AuditLogs',
          details: {
            deletedCount: totalDeleted,
            batches,
            retentionDays,
            duration,
          },
          severity: AuditSeverity.INFO,
        });
      }
    } catch (error) {
      const duration = Date.now() - start;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[${this.name}] Failed after ${duration}ms — deleted=${totalDeleted}, batches=${batches}, error="${message}"`,
        error instanceof Error ? error.stack : undefined,
      );
      await this.auditService.log({
        action: AuditAction.SYSTEM_CLEANUP_FAILURE,
        category: AuditCategory.SYSTEM,
        actorId: undefined,
        actorName: 'System (CleanupAuditLogs)',
        target: 'AuditLogs',
        details: {
          error: message,
          deletedBefore: totalDeleted,
          batches,
          duration,
        },
        severity: AuditSeverity.ERROR,
      });
    }
  }

  private resolveRetentionDays(): number {
    const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
    if (!raw) return CleanupAuditLogsJob.DEFAULT_RETENTION_DAYS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) {
      this.logger.warn(
        `[${this.name}] Invalid AUDIT_LOG_RETENTION_DAYS="${raw}" — ` +
          `falling back to ${CleanupAuditLogsJob.DEFAULT_RETENTION_DAYS}`,
      );
      return CleanupAuditLogsJob.DEFAULT_RETENTION_DAYS;
    }
    return parsed;
  }
}
