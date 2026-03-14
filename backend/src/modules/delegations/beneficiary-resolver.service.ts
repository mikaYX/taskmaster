import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BeneficiaryResolverService {
  private readonly logger = new Logger(BeneficiaryResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves the effective unique user IDs for a given task's active delegation.
   * Prioritizes direct user targets, then group memberships.
   */
  async getEffectiveBeneficiaryUserIds(taskId: number): Promise<number[]> {
    // 1. Find the active delegation for this task AT THIS MOMENT
    const now = new Date();
    const activeDelegation = await this.prisma.client.taskDelegation.findFirst({
      where: {
        taskId,
        startAt: { lte: now },
        endAt: { gt: now },
      },
      include: {
        targetUsers: true,
        targetGroups: true,
      },
    });

    if (!activeDelegation) {
      return [];
    }

    return this.resolveBeneficiaryUserIdsFromDelegation(activeDelegation);
  }

  /**
   * Internal deduplication logic. Given a delegation with targetUsers and targetGroups,
   * returns a unique array of user IDs.
   */
  async resolveBeneficiaryUserIdsFromDelegation(delegation: {
    targetUsers: { userId: number }[];
    targetGroups: { groupId: number }[];
  }): Promise<number[]> {
    const directUserIds = delegation.targetUsers.map((tu) => tu.userId);
    const groupIds = delegation.targetGroups.map((tg) => tg.groupId);

    if (groupIds.length === 0) {
      // Micro-optimization: avoid DB query if no groups
      return Array.from(new Set(directUserIds));
    }

    // 2. Resolve users from the target groups
    const groupMemberships =
      await this.prisma.client.userGroupMembership.findMany({
        where: {
          groupId: { in: groupIds },
        },
        select: { userId: true },
      });

    const groupUserIds = groupMemberships.map(
      (m: { userId: number }) => m.userId,
    );

    // 3. Merge and deduplicate using Set
    const allUserIds = new Set([...directUserIds, ...groupUserIds]);

    return Array.from(allUserIds);
  }

  /**
   * Specifically checks if a specific user is currently an effective beneficiary
   * for the given task. Use this for Authorization checks before validating a task.
   */
  async isEffectiveBeneficiary(
    taskId: number,
    userId: number,
  ): Promise<{
    isBeneficiary: boolean;
    resolutionMode: 'direct_user' | 'via_group' | 'none';
    delegationId?: number;
  }> {
    const now = new Date();
    const activeDelegation = await this.prisma.client.taskDelegation.findFirst({
      where: {
        taskId,
        startAt: { lte: now },
        endAt: { gt: now },
      },
      include: {
        targetUsers: {
          where: { userId },
        },
        targetGroups: {
          include: {
            group: {
              include: {
                members: {
                  where: { userId },
                },
              },
            },
          },
        },
      },
    });

    if (!activeDelegation) {
      return { isBeneficiary: false, resolutionMode: 'none' };
    }

    // 1. Check direct user match
    if (activeDelegation.targetUsers.length > 0) {
      return {
        isBeneficiary: true,
        resolutionMode: 'direct_user',
        delegationId: activeDelegation.id,
      };
    }

    // 2. Check group match
    const isMemberOfTargetGroup = activeDelegation.targetGroups.some(
      (tg: { group: { members: any[] } }) => tg.group.members.length > 0,
    );
    if (isMemberOfTargetGroup) {
      return {
        isBeneficiary: true,
        resolutionMode: 'via_group',
        delegationId: activeDelegation.id,
      };
    }

    return { isBeneficiary: false, resolutionMode: 'none' };
  }
}
