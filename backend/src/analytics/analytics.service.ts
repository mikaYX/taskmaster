import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { Prisma, TaskStatus } from '@prisma/client';
import {
  OverviewResponse,
  TrendPoint,
  TaskComplianceItem,
  UserComplianceItem,
} from './dto';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(
    startDate: string,
    endDate: string,
  ): Promise<OverviewResponse> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const counts = await this.prisma.client.status.groupBy({
      by: ['status'],
      where: {
        instanceDate: { gte: start, lte: end },
      },
      _count: true,
    });

    const success =
      counts.find((c) => c.status === TaskStatus.SUCCESS)?._count ?? 0;
    const failed =
      counts.find((c) => c.status === TaskStatus.FAILED)?._count ?? 0;
    const running =
      counts.find((c) => c.status === TaskStatus.RUNNING)?._count ?? 0;
    const missing =
      counts.find((c) => c.status === TaskStatus.MISSING)?._count ?? 0;
    const total = counts.reduce((sum, c) => sum + c._count, 0);

    const denominator = success + failed + missing;
    const complianceRate =
      denominator > 0 ? Math.round((success / denominator) * 1000) / 10 : 0;

    return { success, failed, running, missing, total, complianceRate };
  }

  async getTrend(
    startDate: string,
    endDate: string,
    groupBy: 'day' | 'week',
  ): Promise<TrendPoint[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (groupBy === 'day') {
      return this.getTrendByDay(start, end);
    }
    return this.getTrendByWeek(start, end);
  }

  private async getTrendByDay(start: Date, end: Date): Promise<TrendPoint[]> {
    const rows = await this.prisma.client.status.groupBy({
      by: ['instanceDate', 'status'],
      where: {
        instanceDate: { gte: start, lte: end },
      },
      _count: true,
      orderBy: { instanceDate: 'asc' },
    });

    const grouped = new Map<string, TrendPoint>();

    for (const row of rows) {
      const dateKey = row.instanceDate.toISOString().split('T')[0];
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          date: dateKey,
          success: 0,
          failed: 0,
          missing: 0,
        });
      }
      const point = grouped.get(dateKey)!;
      if (row.status === TaskStatus.SUCCESS) point.success = row._count;
      else if (row.status === TaskStatus.FAILED) point.failed = row._count;
      else if (row.status === TaskStatus.MISSING) point.missing = row._count;
    }

    return Array.from(grouped.values());
  }

  private async getTrendByWeek(start: Date, end: Date): Promise<TrendPoint[]> {
    // Prisma doesn't support groupBy week natively — raw SQL required
    const rows = await this.prisma.client.$queryRaw<
      Array<{ week_start: Date; status: string; count: bigint }>
    >(Prisma.sql`
      SELECT
        date_trunc('week', instance_date)::date AS week_start,
        status,
        COUNT(*)::bigint AS count
      FROM statuses
      WHERE instance_date >= ${start}
        AND instance_date <= ${end}
      GROUP BY week_start, status
      ORDER BY week_start ASC
    `);

    const grouped = new Map<string, TrendPoint>();

    for (const row of rows) {
      const dateKey = row.week_start.toISOString().split('T')[0];
      if (!grouped.has(dateKey)) {
        grouped.set(dateKey, {
          date: dateKey,
          success: 0,
          failed: 0,
          missing: 0,
        });
      }
      const point = grouped.get(dateKey)!;
      const count = Number(row.count);
      if (row.status === TaskStatus.SUCCESS) point.success = count;
      else if (row.status === TaskStatus.FAILED) point.failed = count;
      else if (row.status === TaskStatus.MISSING) point.missing = count;
    }

    return Array.from(grouped.values());
  }

  async getByTask(
    startDate: string,
    endDate: string,
    limit: number,
  ): Promise<TaskComplianceItem[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rows = await this.prisma.client.$queryRaw<
      Array<{
        task_id: number;
        task_name: string;
        total: bigint;
        failed: bigint;
        success: bigint;
        missing: bigint;
      }>
    >(Prisma.sql`
      SELECT
        s.task_id,
        t.name AS task_name,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE s.status = 'FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE s.status = 'SUCCESS')::bigint AS success,
        COUNT(*) FILTER (WHERE s.status = 'MISSING')::bigint AS missing
      FROM statuses s
      INNER JOIN tasks t ON t.id = s.task_id
      WHERE s.instance_date >= ${start}
        AND s.instance_date <= ${end}
        AND t.deleted_at IS NULL
      GROUP BY s.task_id, t.name
      ORDER BY
        CASE WHEN COUNT(*) FILTER (WHERE s.status = 'SUCCESS') + COUNT(*) FILTER (WHERE s.status = 'FAILED') + COUNT(*) FILTER (WHERE s.status = 'MISSING') = 0
          THEN 0
          ELSE (COUNT(*) FILTER (WHERE s.status = 'SUCCESS')::float / (COUNT(*) FILTER (WHERE s.status = 'SUCCESS') + COUNT(*) FILTER (WHERE s.status = 'FAILED') + COUNT(*) FILTER (WHERE s.status = 'MISSING'))) * 100
        END ASC
      LIMIT ${limit}
    `);

    return rows.map((row) => {
      const s = Number(row.success);
      const f = Number(row.failed);
      const m = Number(row.missing);
      const denominator = s + f + m;
      return {
        taskId: row.task_id,
        taskName: row.task_name,
        total: Number(row.total),
        success: s,
        failed: f,
        missing: m,
        complianceRate:
          denominator > 0 ? Math.round((s / denominator) * 1000) / 10 : 0,
      };
    });
  }

  async getByUser(
    startDate: string,
    endDate: string,
  ): Promise<UserComplianceItem[]> {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const rows = await this.prisma.client.$queryRaw<
      Array<{
        user_id: number;
        username: string;
        fullname: string | null;
        total: bigint;
        success: bigint;
        failed: bigint;
        missing: bigint;
      }>
    >(Prisma.sql`
      SELECT
        s.updated_by_user_id AS user_id,
        u.username,
        u.fullname,
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE s.status = 'SUCCESS')::bigint AS success,
        COUNT(*) FILTER (WHERE s.status = 'FAILED')::bigint AS failed,
        COUNT(*) FILTER (WHERE s.status = 'MISSING')::bigint AS missing
      FROM statuses s
      INNER JOIN users u ON u.id = s.updated_by_user_id
      WHERE s.instance_date >= ${start}
        AND s.instance_date <= ${end}
        AND s.updated_by_user_id IS NOT NULL
        AND u.deleted_at IS NULL
      GROUP BY s.updated_by_user_id, u.username, u.fullname
      ORDER BY
        CASE WHEN COUNT(*) FILTER (WHERE s.status = 'SUCCESS') + COUNT(*) FILTER (WHERE s.status = 'FAILED') + COUNT(*) FILTER (WHERE s.status = 'MISSING') = 0
          THEN 0
          ELSE (COUNT(*) FILTER (WHERE s.status = 'SUCCESS')::float / (COUNT(*) FILTER (WHERE s.status = 'SUCCESS') + COUNT(*) FILTER (WHERE s.status = 'FAILED') + COUNT(*) FILTER (WHERE s.status = 'MISSING'))) * 100
        END ASC
    `);

    return rows.map((row) => {
      const s = Number(row.success);
      const f = Number(row.failed);
      const m = Number(row.missing);
      const denominator = s + f + m;
      return {
        userId: row.user_id,
        username: row.username,
        fullname: row.fullname ?? '',
        total: Number(row.total),
        success: s,
        failed: f,
        complianceRate:
          denominator > 0 ? Math.round((s / denominator) * 1000) / 10 : 0,
      };
    });
  }
}
