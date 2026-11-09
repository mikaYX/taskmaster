import { Logger } from '@nestjs/common';
import type { PrismaService } from '../prisma';

/** Receipt formats are persisted API: keep compatibility with previously sent alerts. */
type Delivery =
  | { type: 'audit'; date: string }
  | { type: 'reminder'; notificationId: number; date: string; deadline: Date }
  | { type: 'overdue' }
  | { type: 'channel'; key: string; notificationId: number };

const RESERVATION_TIME = new Date(0);
const DAY_MS = 86_400_000;
export const DELIVERY_LEASE_MS = 5 * 60_000;

export class UniqueDelivery {
  private readonly logger = new Logger(UniqueDelivery.name);
  constructor(private readonly client: PrismaService['client']) {}

  static auditChannelKey(date: string): string {
    return `audit:${date}`;
  }

  private identity(delivery: Delivery) {
    switch (delivery.type) {
      case 'audit':
        return {
          kind: `audit:${delivery.date}`,
          rolling: false,
          sentAt: RESERVATION_TIME,
        };
      case 'reminder':
        return {
          kind: `reminder:${delivery.notificationId}:${delivery.date}`,
          rolling: false,
          sentAt: delivery.deadline,
        };
      case 'overdue':
        return { kind: 'OVERDUE', rolling: true, sentAt: RESERVATION_TIME };
      case 'channel':
        return {
          kind: `sent:${delivery.key}:${delivery.notificationId}`,
          rolling: delivery.key === 'hourly',
          sentAt: RESERVATION_TIME,
        };
    }
  }

  /** Batch reads preserve the audit's query cost regardless of the number of occurrences. */
  async auditReceipts(taskIds: number[]): Promise<Set<string>> {
    const receipts = await this.client.notification.findMany({
      where: {
        taskId: { in: taskIds },
        kind: { startsWith: 'audit:' },
        sentAt: { gt: RESERVATION_TIME },
      },
      select: { taskId: true, kind: true },
    });
    return new Set(
      receipts.map((receipt) => `${receipt.taskId}:${receipt.kind.slice(6)}`),
    );
  }

  async recentOverdue(taskIds: number[]): Promise<Set<number>> {
    if (!taskIds.length) return new Set();
    const receipts = await this.client.notification.findMany({
      where: {
        taskId: { in: taskIds },
        OR: [
          { kind: 'OVERDUE', sentAt: { gte: new Date(Date.now() - DAY_MS) } },
          {
            kind: 'pending:OVERDUE',
            sentAt: { gt: new Date(Date.now() - DELIVERY_LEASE_MS) },
          },
        ],
      },
      select: { taskId: true },
    });
    return new Set(receipts.map((receipt) => receipt.taskId));
  }

  /** The lease and the final receipt are distinct rows states, without a schema change.
   * The advisory lock only covers claiming, never network delivery. Expired leases
   * can be retried (possibly duplicating an ambiguously completed send), not lost forever.
   */
  private async runLeased(
    taskId: number,
    kind: string,
    rolling: boolean,
    send: () => Promise<unknown>,
  ): Promise<boolean> {
    const pendingKind = `pending:${kind}`;
    const reservation = await this.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${taskId}::integer, hashtext(${kind}))`;
      const now = new Date();
      if (
        await tx.notification.findFirst({
          where: {
            taskId,
            OR: [
              {
                kind,
                sentAt: rolling
                  ? { gte: new Date(+now - DAY_MS) }
                  : { gt: RESERVATION_TIME },
              },
              {
                kind: pendingKind,
                sentAt: { gt: new Date(+now - DELIVERY_LEASE_MS) },
              },
            ],
          },
        })
      )
        return undefined;

      // Epoch reservations from the previous implementation have no creation
      // date. Treat them as stale; dated legacy receipts remain authoritative.
      await tx.notification.deleteMany({
        where: {
          taskId,
          OR: [
            { kind, sentAt: RESERVATION_TIME },
            {
              kind: pendingKind,
              sentAt: { lte: new Date(+now - DELIVERY_LEASE_MS) },
            },
          ],
        },
      });
      const key = { taskId, kind: pendingKind, sentAt: now };
      await tx.notification.create({ data: key });
      return key;
    });
    if (!reservation) return false;
    try {
      await send();
    } catch (error) {
      // Ownership includes the lease timestamp, so a late worker cannot release
      // a replacement lease acquired after its own expiration.
      await this.client.notification
        .deleteMany({ where: reservation })
        .catch(() => undefined);
      throw error;
    }
    // On acknowledgement failure leave the lease to expire after five minutes.
    const result = await this.client.notification.updateMany({
      where: reservation,
      data: { kind, sentAt: new Date() },
    });
    if (result.count === 0) {
      this.logger.warn(
        `Notification delivery lease expired after successful send for task ${taskId} (${kind})`,
      );
    }
    return true;
  }

  async run(
    taskId: number,
    delivery: Delivery,
    send: () => Promise<unknown>,
    /** Batch callers already checked old receipts; the unique insert still arbitrates concurrent runs. */
    checked = false,
  ): Promise<boolean> {
    const { kind, rolling, sentAt } = this.identity(delivery);
    if (
      rolling ||
      delivery.type === 'audit' ||
      (delivery.type === 'channel' && delivery.key.startsWith('audit:'))
    ) {
      return this.runLeased(taskId, kind, rolling, send);
    }
    if (
      !checked &&
      delivery.type !== 'reminder' &&
      (await this.client.notification.findFirst({
        where: { taskId, kind },
      }))
    )
      return false;

    const key = { taskId, kind, sentAt };
    try {
      await this.client.notification.create({ data: key });
    } catch (error: unknown) {
      if ((error as { code?: string })?.code === 'P2002') return false;
      throw error;
    }
    try {
      await send();
    } catch (error) {
      await this.client.notification
        .delete({ where: { taskId_kind_sentAt: key } })
        .catch(() => undefined);
      throw error;
    }
    return true;
  }
}
