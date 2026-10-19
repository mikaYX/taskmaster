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

  /**
   * The sites whose figures the caller may see: `undefined` means all of them (a
   * super administrator with no site selected), otherwise the list, possibly
   * empty. Every figure used to cover every site, whoever asked.
   */
  private visibleSiteIds(): number[] | undefined {
    const user = this.prisma.getCurrentUser();
    if (!user) return undefined; // internal call, no request
    const filter = this.prisma.buildSiteFilter().siteId;
    if (filter === undefined) {
      return user.role === 'SUPER_ADMIN' ? undefined : [];
    }
    return typeof filter === 'number' ? [filter] : filter.in;
  }

  private statusSiteWhere(
    siteIds: number[] | undefined,
  ): Prisma.StatusWhereInput {
    return siteIds ? { task: { siteId: { in: siteIds } } } : {};
  }

  /** For the raw queries, which alias the tasks table as `t`. */
  private siteSql(siteIds: number[] | undefined): Prisma.Sql {
    return siteIds
      ? Prisma.sql`AND t.site_id IN (${Prisma.join(siteIds)})`
      : Prisma.empty;
  }

  async getOverview(
    startDate: string,
    endDate: string,
  ): Promise<OverviewResponse> {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const siteIds = this.visibleSiteIds();
    if (siteIds?.length === 0) {
      return {
        success: 0,
        failed: 0,
        running: 0,
        missing: 0,
        total: 0,
        complianceRate: 0,
      };
    }

    const counts = await this.prisma.client.status.groupBy({
      by: ['status'],
      where: {
        instanceDate: { gte: start, lte: end },
        ...this.statusSiteWhere(siteIds),
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
    const siteIds = this.visibleSiteIds();
    if (siteIds?.length === 0) return [];

    if (groupBy === 'day') {
      return this.getTrendByDay(start, end, siteIds);
    }
    return this.getTrendByWeek(start, end, siteIds);
  }

  private async getTrendByDay(
    start: Date,
    end: Date,
    siteIds: number[] | undefined,
  ): Promise<TrendPoint[]> {
    const rows = await this.prisma.client.status.groupBy({
      by: ['instanceDate', 'status'],
      where: {
        instanceDate: { gte: start, lte: end },
        ...this.statusSiteWhere(siteIds),
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

  private async getTrendByWeek(
    start: Date,
    end: Date,
    siteIds: number[] | undefined,
  ): Promise<TrendPoint[]> {
    // Prisma doesn't support groupBy week natively — raw SQL required
    const rows = await this.prisma.client.$queryRaw<
      Array<{ week_start: Date; status: string; count: bigint }>
    >(Prisma.sql`
      SELECT
        date_trunc('week', s.instance_date)::date AS week_start,
        s.status,
        COUNT(*)::bigint AS count
      FROM statuses s
      INNER JOIN tasks t ON t.id = s.task_id
      WHERE s.instance_date >= ${start}
        AND s.instance_date <= ${end}
        ${this.siteSql(siteIds)}
      GROUP BY week_start, s.status
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
    const siteIds = this.visibleSiteIds();
    if (siteIds?.length === 0) return [];

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
        ${this.siteSql(siteIds)}
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
    const siteIds = this.visibleSiteIds();
    if (siteIds?.length === 0) return [];

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
      INNER JOIN tasks t ON t.id = s.task_id
      WHERE s.instance_date >= ${start}
        AND s.instance_date <= ${end}
        AND s.updated_by_user_id IS NOT NULL
        AND u.deleted_at IS NULL
        ${this.siteSql(siteIds)}
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
