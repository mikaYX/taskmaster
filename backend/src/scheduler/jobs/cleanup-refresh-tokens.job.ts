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
 * Cleanup Refresh Tokens Job.
 *
 * Two retention rules — addresses AUDIT.md Finding #9 (storage limitation,
 * GDPR Art. 5(1)(e)) and prevents `refresh_tokens` from accumulating
 * indefinitely revoked rows:
 *
 *  - Hard-delete any row whose `expiresAt` is in the past (the JWT cannot be
 *    redeemed anymore — keeping the row only feeds reuse-detection metrics).
 *  - Hard-delete any row revoked more than
 *    `REFRESH_TOKEN_REVOKED_RETENTION_DAYS` ago (default 90 days). The
 *    revocation history is still preserved in `audit_logs` for forensics.
 *
 * Deletes are batched (`BATCH_SIZE`) to keep per-batch locks short.
 * Runs at 04:15 — staggered after `cleanup-audit-logs` to spread DB load.
 */
@Injectable()
export class CleanupRefreshTokensJob implements SchedulerJob {
  readonly name = 'cleanup-refresh-tokens';
  readonly cron = '15 4 * * *'; // Daily at 04:15

  private static readonly BATCH_SIZE = 10_000;
  private static readonly MAX_BATCHES = 100;
  private static readonly DEFAULT_REVOKED_RETENTION_DAYS = 90;

  private readonly logger = new Logger(CleanupRefreshTokensJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  @Cron('15 4 * * *', { name: 'cleanup-refresh-tokens' })
  async execute(): Promise<void> {
    const start = Date.now();
    const revokedRetentionDays = this.resolveRevokedRetentionDays();
    const now = new Date();
    const revokedCutoff = new Date(
      now.getTime() - revokedRetentionDays * 24 * 60 * 60 * 1000,
    );

    this.logger.log(
      `[${this.name}] Starting — now=${now.toISOString()}, ` +
        `revokedCutoff=${revokedCutoff.toISOString()}, ` +
        `revokedRetentionDays=${revokedRetentionDays}`,
    );

    let totalDeleted = 0;
    let batches = 0;

    try {
      // Same batching pattern as cleanup-audit-logs.job.ts.

      while (true) {
        if (batches >= CleanupRefreshTokensJob.MAX_BATCHES) {
          this.logger.warn(
            `[${this.name}] MAX_BATCHES reached (${batches}) — remaining ` +
              `rows will be removed on the next run`,
          );
          break;
        }

        const stale = await this.prisma.client.refreshToken.findMany({
          where: {
            OR: [
              { expiresAt: { lt: now } },
              { revokedAt: { lt: revokedCutoff } },
            ],
          },
          take: CleanupRefreshTokensJob.BATCH_SIZE,
          select: { id: true },
        });
        if (stale.length === 0) break;

        const { count } = await this.prisma.client.refreshToken.deleteMany({
          where: { id: { in: stale.map((row) => row.id) } },
        });
        totalDeleted += count;
        batches += 1;

        if (count < CleanupRefreshTokensJob.BATCH_SIZE) break;
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
          actorName: 'System (CleanupRefreshTokens)',
          target: 'RefreshTokens',
          details: {
            deletedCount: totalDeleted,
            batches,
            revokedRetentionDays,
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
        actorName: 'System (CleanupRefreshTokens)',
        target: 'RefreshTokens',
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

  private resolveRevokedRetentionDays(): number {
    const raw = process.env.REFRESH_TOKEN_REVOKED_RETENTION_DAYS;
    if (!raw) return CleanupRefreshTokensJob.DEFAULT_REVOKED_RETENTION_DAYS;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      this.logger.warn(
        `[${this.name}] Invalid REFRESH_TOKEN_REVOKED_RETENTION_DAYS="${raw}" — ` +
          `falling back to ${CleanupRefreshTokensJob.DEFAULT_REVOKED_RETENTION_DAYS}`,
      );
      return CleanupRefreshTokensJob.DEFAULT_REVOKED_RETENTION_DAYS;
    }
    return parsed;
  }
}
