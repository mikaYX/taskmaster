import type { PrismaService } from '../prisma';
import type { FromCompletionContext } from '../tasks/instance.service';

/** What a "from completion" task needs to compute its next occurrence. */
export async function loadFromCompletionContext(
  client: PrismaService['client'],
  taskId: number,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<FromCompletionContext> {
  const lastTerminal = await client.status.findFirst({
    where: { taskId, status: { in: ['SUCCESS', 'FAILED'] } },
    orderBy: { updatedAt: 'desc' },
  });

  const running = await client.status.count({
    where: {
      taskId,
      status: 'RUNNING',
      instanceDate: { gte: rangeStart, lte: rangeEnd },
    },
  });

  return {
    lastTerminalDate: lastTerminal?.updatedAt ?? null,
    hasRunningInstance: running > 0,
  };
}
