import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma';
import { startOfDay, endOfDay } from 'date-fns';

export interface DashboardStats {
  success: number;
  failed: number;
  running: number;
  missing: number;
  total: number;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getStats(
    userId: number,
    groupIds: number[],
    isAdmin: boolean,
    filterUserId?: number,
    filterGroupId?: number,
  ): Promise<DashboardStats> {
    const now = new Date();
    const start = startOfDay(now);
    const end = endOfDay(now);

    const whereClause: any = {
      instanceDate: { gte: start, lte: end },
    };

    if (!isAdmin) {
      whereClause.task = {
        deletedAt: null,
        OR: [
          { userAssignments: { some: { userId } } },
          ...(groupIds.length > 0
            ? [{ groupAssignments: { some: { groupId: { in: groupIds } } } }]
            : []),
          {
            delegations: {
              some: {
                startAt: { lte: now },
                endAt: { gt: now },
                OR: [
                  { targetUsers: { some: { userId } } },
                  {
                    targetGroups: {
                      some: { group: { members: { some: { userId } } } },
                    },
                  },
                ],
              },
            },
          },
        ],
      };
    } else {
      if (filterUserId !== undefined) {
        whereClause.task = {
          deletedAt: null,
          OR: [
            { userAssignments: { some: { userId: filterUserId } } },
            {
              groupAssignments: {
                some: {
                  group: { members: { some: { userId: filterUserId } } },
                },
              },
            },
            {
              delegations: {
                some: {
                  startAt: { lte: now },
                  endAt: { gt: now },
                  OR: [
                    { targetUsers: { some: { userId: filterUserId } } },
                    {
                      targetGroups: {
                        some: {
                          group: {
                            members: { some: { userId: filterUserId } },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          ],
        };
      } else if (filterGroupId !== undefined) {
        whereClause.task = {
          deletedAt: null,
          groupAssignments: { some: { groupId: filterGroupId } },
        };
      }
    }

    const counts = await this.prisma.client.status.groupBy({
      by: ['status'],
      where: whereClause,
      _count: true,
    });

    return {
      success: counts.find((c: any) => c.status === 'SUCCESS')?._count ?? 0,
      failed: counts.find((c: any) => c.status === 'FAILED')?._count ?? 0,
      running: counts.find((c: any) => c.status === 'RUNNING')?._count ?? 0,
      missing: counts.find((c: any) => c.status === 'MISSING')?._count ?? 0,
      total: counts.reduce((sum: number, c: any) => sum + c._count, 0),
    };
  }
}
