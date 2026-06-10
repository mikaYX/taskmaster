import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { anonymizeIp } from '../common/utils/ip-anonymizer.util';
import {
  AuditActionType,
  AuditCategory,
  AuditSeverity,
} from './audit.constants';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(payload: {
    action: AuditActionType;
    actorId?: number;
    actorName?: string;
    target?: string;
    category: AuditCategory;
    severity?: AuditSeverity;
    details?: Record<string, any>;
    ipAddress?: string;
  }) {
    try {
      // GDPR Art. 5(1)(c) — anonymize IP before persistence (AUDIT.md #8, §15.3).
      // Helper preserves null/undefined/"unknown" sentinel; bad inputs → null.
      await this.prisma.client.auditLog.create({
        data: {
          action: payload.action,
          actorId: payload.actorId,
          actorName: payload.actorName || 'System',
          target: payload.target,
          category: payload.category,
          severity: payload.severity || AuditSeverity.INFO,
          details: payload.details ? JSON.stringify(payload.details) : null,
          ipAddress: anonymizeIp(payload.ipAddress) ?? undefined,
        },
      });
    } catch (error) {
      // Fail-safe: audit logging must not crash the main application flow.
      // Emit a structured log so ops can alert on missing audit entries
      // (e.g., alert when `[AUDIT_LOG_FAILED]` appears in production logs).
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[AUDIT_LOG_FAILED] action=${payload.action} category=${payload.category} ` +
          `severity=${payload.severity || AuditSeverity.INFO} ` +
          `actorId=${payload.actorId ?? 'null'} target=${payload.target ?? 'null'} ` +
          `error="${message}"`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  async findAll(params: {
    skip?: number;
    take?: number;
    orderBy?: object;
    where?: object;
  }) {
    const { skip, take, orderBy, where } = params;

    // Default order by timestamp desc
    const order = orderBy || { timestamp: 'desc' };

    const [data, total] = await Promise.all([
      this.prisma.client.auditLog.findMany({
        skip,
        take,
        where,
        orderBy: order,
        include: {
          actor: {
            select: {
              username: true,
              fullname: true,
            },
          },
        },
      }),
      this.prisma.client.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: Math.floor((skip || 0) / (take || 10)) + 1,
      limit: take || 10,
    };
  }
  async logDiff(payload: {
    action: AuditActionType;
    actor: { id: number; username: string };
    target: string; // e.g., "Task:123"
    category: AuditCategory;
    before: any;
    after: any;
    severity?: AuditSeverity;
  }) {
    const diff = this.computeDiff(payload.before, payload.after);
    if (!diff) return; // No changes detected

    await this.log({
      action: payload.action,
      actorId: payload.actor.id,
      actorName: payload.actor.username,
      target: payload.target,
      category: payload.category,
      severity: payload.severity,
      details: diff,
    });
  }

  private computeDiff(
    before: any,
    after: any,
  ): Record<string, { from: any; to: any }> | null {
    if (!before || !after) return null;
    const diff: Record<string, { from: any; to: any }> = {};
    let hasChanges = false;

    const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

    for (const key of allKeys) {
      // Ignore timestamps and internal fields
      if (['updatedAt', 'updated_at', 'createdAt', 'created_at'].includes(key))
        continue;

      const val1 = before[key];
      const val2 = after[key];

      // Simple equality check
      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        diff[key] = {
          from: this.redact(key, val1),
          to: this.redact(key, val2),
        };
        hasChanges = true;
      }
    }

    return hasChanges ? diff : null;
  }

  private redact(key: string, value: any): any {
    if (!value) return value;
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'hash'];
    if (sensitiveKeys.some((k) => key.toLowerCase().includes(k))) {
      return '[REDACTED]';
    }
    return value;
  }
}
