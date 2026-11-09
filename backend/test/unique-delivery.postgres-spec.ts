import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  DELIVERY_LEASE_MS,
  UniqueDelivery,
} from '../src/notifications/unique-delivery';

/** Requires a disposable, already provisioned taskmaster_notifications_test DB.
 * Never falls back to DATABASE_URL, loads .env, creates a DB or applies migrations.
 * Run: npm -w backend run test:notifications:postgres
 */
const testUrl = process.env.TASKMASTER_NOTIFICATIONS_TEST_DATABASE_URL;
const postgresTests = testUrl ? describe : describe.skip;

postgresTests('UniqueDelivery against isolated PostgreSQL', () => {
  let client: PrismaClient;
  let pool: Pool;
  let delivery: UniqueDelivery;
  let siteId: number;
  let taskId: number;

  beforeAll(async () => {
    if (new URL(testUrl!).pathname !== '/taskmaster_notifications_test') {
      throw new Error(
        'Use a disposable database named taskmaster_notifications_test',
      );
    }
    pool = new Pool({ connectionString: testUrl, max: 4 });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    delivery = new UniqueDelivery(client);
    siteId = (
      await client.site.create({
        data: { name: 'Notification tests', code: randomUUID() },
      })
    ).id;
  });

  beforeEach(async () => {
    taskId = (
      await client.task.create({
        data: {
          siteId,
          name: 'Delivery test',
          description: 'PostgreSQL delivery fixture',
          periodicity: 'daily',
          startDate: new Date(),
        },
      })
    ).id;
  });

  afterAll(async () => {
    try {
      if (client && siteId) {
        // Only remove this suite's fixtures; task deletion cascades its receipts.
        await client.task.deleteMany({ where: { siteId } });
        await client.site.delete({ where: { id: siteId } });
      }
    } finally {
      await client?.$disconnect();
      await pool?.end();
    }
  });

  it('enforces the existing (taskId, kind, sentAt) unique constraint', async () => {
    const data = { taskId, kind: 'reminder:3:2026-05-04', sentAt: new Date() };
    await client.notification.create({ data });
    await expect(client.notification.create({ data })).rejects.toMatchObject({
      code: 'P2002',
    });
    expect(await client.notification.count({ where: { taskId } })).toBe(1);
  });

  it.each([
    [{ type: 'overdue' }, 'OVERDUE'],
    [{ type: 'channel', key: 'hourly', notificationId: 3 }, 'sent:hourly:3'],
    [{ type: 'audit', date: '2026-05-04' }, 'audit:2026-05-04'],
    [
      { type: 'channel', key: 'audit:2026-05-04', notificationId: 3 },
      'sent:audit:2026-05-04:3',
    ],
  ] as const)(
    'serializes two simultaneous %j calls with the real advisory lock and interactive transaction',
    async (identity, kind) => {
      const send = jest.fn(async () => {
        // Keep the first delivery in flight after the short claim transaction commits.
        await new Promise((resolve) => setTimeout(resolve, 50));
      });
      const results = await Promise.all([
        delivery.run(taskId, identity, send),
        new UniqueDelivery(client).run(taskId, identity, send),
      ]);
      expect(results.sort()).toEqual([false, true]);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await client.notification.findMany({ where: { taskId } })).toEqual(
        [expect.objectContaining({ taskId, kind })],
      );
    },
  );

  it.each([
    [{ type: 'overdue' }, 'OVERDUE'],
    [{ type: 'audit', date: '2026-05-04' }, 'audit:2026-05-04'],
    [
      { type: 'channel', key: 'audit:2026-05-04', notificationId: 3 },
      'sent:audit:2026-05-04:3',
    ],
  ] as const)(
    'takes over a crashed %j lease, preserving the final kind',
    async (identity, kind) => {
      const lease = await client.notification.create({
        data: {
          taskId,
          kind: `pending:${kind}`,
          sentAt: new Date(),
        },
      });
      const send = jest.fn().mockResolvedValue(undefined);
      expect(await delivery.run(taskId, identity, send)).toBe(false);
      await client.notification.update({
        where: { id: lease.id },
        data: {
          sentAt: new Date(Date.now() - DELIVERY_LEASE_MS - 1000),
        },
      });
      expect(await delivery.run(taskId, identity, send)).toBe(true);
      expect(await delivery.run(taskId, identity, send)).toBe(false);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await client.notification.findMany({ where: { taskId } })).toEqual(
        [expect.objectContaining({ taskId, kind })],
      );
      if (identity.type === 'audit') {
        expect(await delivery.auditReceipts([taskId])).toEqual(
          new Set([`${taskId}:2026-05-04`]),
        );
      }
    },
  );

  it.each([
    [{ type: 'overdue' }, 'OVERDUE'],
    [{ type: 'channel', key: 'hourly', notificationId: 3 }, 'sent:hourly:3'],
    [{ type: 'audit', date: '2026-05-04' }, 'audit:2026-05-04'],
    [
      { type: 'channel', key: 'audit:2026-05-04', notificationId: 3 },
      'sent:audit:2026-05-04:3',
    ],
  ] as const)(
    'reclaims legacy epoch-zero %j reservations',
    async (identity, kind) => {
      await client.notification.create({
        data: { taskId, kind, sentAt: new Date(0) },
      });
      expect(await delivery.recentOverdue([taskId])).toEqual(new Set());
      expect(await delivery.auditReceipts([taskId])).toEqual(new Set());
      const send = jest.fn().mockResolvedValue(undefined);
      expect(await delivery.run(taskId, identity, send)).toBe(true);
      expect(send).toHaveBeenCalledTimes(1);
      expect(
        await client.notification.count({
          where: { taskId, sentAt: new Date(0) },
        }),
      ).toBe(0);
    },
  );

  it('keeps dated legacy audit and channel receipts authoritative regardless of age', async () => {
    await client.notification.createMany({
      data: ['audit:2026-05-04', 'sent:audit:2026-05-04:3'].map((kind) => ({
        taskId,
        kind,
        sentAt: new Date('2026-05-04T19:00:00Z'),
      })),
    });
    const send = jest.fn();
    expect(
      await delivery.run(taskId, { type: 'audit', date: '2026-05-04' }, send),
    ).toBe(false);
    expect(
      await delivery.run(
        taskId,
        { type: 'channel', key: 'audit:2026-05-04', notificationId: 3 },
        send,
      ),
    ).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('releases a failed send for retry', async () => {
    await expect(
      delivery.run(taskId, { type: 'overdue' }, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(await client.notification.count({ where: { taskId } })).toBe(0);
    expect(
      await delivery.run(taskId, { type: 'overdue' }, async () => undefined),
    ).toBe(true);
  });
});
