import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma';

export function isExecutionManager(role: string): boolean {
  return ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(role);
}

export function assertExecutionSite(
  prisma: PrismaService,
  siteId: number,
  role: string,
): void {
  const selected = prisma.buildSiteFilter().siteId;
  if (
    (typeof selected === 'number' && selected !== siteId) ||
    (typeof selected === 'object' && !selected.in.includes(siteId))
  ) {
    throw new ForbiddenException('This task is outside the selected site');
  }
  if (role === 'SUPER_ADMIN') return;
  if (!prisma.getUserSiteIds().includes(siteId)) {
    throw new ForbiddenException('This task is outside your sites');
  }
}
