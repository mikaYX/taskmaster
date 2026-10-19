import { Prisma } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService - figures are limited to the caller sites', () => {
  const status = { groupBy: jest.fn() };
  const queryRaw = jest.fn();
  const current = {
    user: undefined as undefined | { id: number; role: string; sites: [] },
    filter: {} as { siteId?: number | { in: number[] } },
  };
  const prisma = {
    client: { status, $queryRaw: queryRaw },
    getCurrentUser: () => current.user,
    buildSiteFilter: () => current.filter,
  };
  const service = new AnalyticsService(prisma as never);

  const range = ['2026-10-01', '2026-10-31'] as const;
  const as = (role: string, filter: { siteId?: number | { in: number[] } }) => {
    current.user = { id: 1, role, sites: [] };
    current.filter = filter;
  };
  const sqlOf = (call: number) => queryRaw.mock.calls[call][0] as Prisma.Sql;

  beforeEach(() => {
    jest.resetAllMocks();
    status.groupBy.mockResolvedValue([]);
    queryRaw.mockResolvedValue([]);
    current.user = undefined;
    current.filter = {};
  });

  describe('a TV or standard account of one site', () => {
    beforeEach(() => as('GUEST', { siteId: 2 }));

    it('counts only the statuses of tasks of that site (overview)', async () => {
      await service.getOverview(...range);

      expect(status.groupBy.mock.calls[0][0].where).toMatchObject({
        task: { siteId: { in: [2] } },
      });
    });

    it('counts only that site per day (trend)', async () => {
      await service.getTrend(...range, 'day');

      expect(status.groupBy.mock.calls[0][0].where).toMatchObject({
        task: { siteId: { in: [2] } },
      });
    });

    it('restricts the weekly trend, which is raw SQL, to that site', async () => {
      await service.getTrend(...range, 'week');

      const sql = sqlOf(0);
      expect(sql.sql).toMatch(/INNER JOIN tasks t/);
      expect(sql.sql).toMatch(/t\.site_id IN \(\?\)/);
      expect(sql.values).toContain(2);
    });

    it('restricts the per-task ranking to that site', async () => {
      await service.getByTask(...range, 50);

      expect(sqlOf(0).sql).toMatch(/t\.site_id IN \(\?\)/);
      expect(sqlOf(0).values).toContain(2);
    });

    it('restricts the per-user ranking to that site', async () => {
      await service.getByUser(...range);

      expect(sqlOf(0).sql).toMatch(/INNER JOIN tasks t/);
      expect(sqlOf(0).sql).toMatch(/t\.site_id IN \(\?\)/);
      expect(sqlOf(0).values).toContain(2);
    });
  });

  it('keeps every site of a manager attached to several', async () => {
    as('MANAGER', { siteId: { in: [1, 4] } });

    await service.getByTask(...range, 50);

    expect(sqlOf(0).sql).toMatch(/t\.site_id IN \(\?,\?\)/);
    expect(sqlOf(0).values).toEqual(expect.arrayContaining([1, 4]));
  });

  it('shows a super administrator everything unless a site is selected', async () => {
    as('SUPER_ADMIN', {});
    await service.getOverview(...range);
    expect(status.groupBy.mock.calls[0][0].where).not.toHaveProperty('task');

    as('SUPER_ADMIN', { siteId: 3 });
    await service.getOverview(...range);
    expect(status.groupBy.mock.calls[1][0].where).toMatchObject({
      task: { siteId: { in: [3] } },
    });
  });

  it('shows nothing, and does not query, to an account that has no site', async () => {
    as('MANAGER', {}); // the filter is empty when a non-admin has no site

    await expect(service.getOverview(...range)).resolves.toMatchObject({
      total: 0,
      complianceRate: 0,
    });
    await expect(service.getTrend(...range, 'day')).resolves.toEqual([]);
    await expect(service.getTrend(...range, 'week')).resolves.toEqual([]);
    await expect(service.getByTask(...range, 50)).resolves.toEqual([]);
    await expect(service.getByUser(...range)).resolves.toEqual([]);
    expect(status.groupBy).not.toHaveBeenCalled();
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('does not restrict an internal call without a current user', async () => {
    await service.getOverview(...range);
    await service.getByTask(...range, 50);

    expect(status.groupBy.mock.calls[0][0].where).not.toHaveProperty('task');
    expect(sqlOf(0).sql).not.toMatch(/site_id/);
  });
});
