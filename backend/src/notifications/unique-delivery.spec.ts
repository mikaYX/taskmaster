import { Logger } from '@nestjs/common';
import { receiptStore } from './__mocks__/receipt-store';
import { NotificationsService } from './notifications.service';
import { ReminderNotificationJob } from '../scheduler/jobs/reminder-notification.job';
import { safeFetch } from '../common/utils/url-validator.util';
jest.mock('../common/utils/url-validator.util', () => ({
  safeFetch: jest.fn(),
}));
import { DELIVERY_LEASE_MS, UniqueDelivery } from './unique-delivery';
import type { PrismaService } from '../prisma';

describe('UniqueDelivery', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T19:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('claims an occurrence once across concurrent callers and releases a failed claim', async () => {
    const store = receiptStore();
    const delivery = new UniqueDelivery(
      store as unknown as PrismaService['client'],
    );
    const identity = { type: 'audit', date: '2026-05-04' } as const;
    const send = jest.fn().mockResolvedValue(undefined);
    expect(
      await Promise.all([
        delivery.run(1, identity, send),
        delivery.run(1, identity, send),
      ]),
    ).toEqual([true, false]);
    expect(send).toHaveBeenCalledTimes(1);
    await expect(
      delivery.run(2, identity, async () => {
        throw new Error('offline');
      }),
    ).rejects.toThrow('offline');
    expect(store.receipts).toHaveLength(1);
    expect(await delivery.run(2, identity, send)).toBe(true);
  });

  it.each([
    [{ type: 'audit', date: '2026-05-04' }, 'audit:2026-05-04'],
    [
      { type: 'channel', key: 'audit:2026-05-04', notificationId: 3 },
      'sent:audit:2026-05-04:3',
    ],
    [{ type: 'channel', key: 'hourly', notificationId: 3 }, 'sent:hourly:3'],
    [{ type: 'overdue' }, 'OVERDUE'],
  ] as const)('honours legacy receipts for %j', async (identity, kind) => {
    const store = receiptStore();
    store.receipts.push({ taskId: 1, kind, sentAt: new Date() });
    const delivery = new UniqueDelivery(
      store as unknown as PrismaService['client'],
    );
    const send = jest.fn();
    expect(await delivery.run(1, identity, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
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
    'recovers a crashed %s lease after five minutes',
    async (identity, kind) => {
      const store = receiptStore();
      const delivery = new UniqueDelivery(
        store as unknown as PrismaService['client'],
      );
      // Persisted lease left by a terminated worker; no final receipt exists.
      store.receipts.push({
        taskId: 1,
        kind: `pending:${kind}`,
        sentAt: new Date(),
      });
      const send = jest.fn().mockResolvedValue(undefined);
      expect(await delivery.run(1, identity, send)).toBe(false);
      if (kind === 'OVERDUE')
        expect(await delivery.recentOverdue([1])).toEqual(new Set([1]));
      jest.advanceTimersByTime(DELIVERY_LEASE_MS - 1);
      expect(await delivery.run(1, identity, send)).toBe(false);
      jest.advanceTimersByTime(1);
      if (kind === 'OVERDUE')
        expect(await delivery.recentOverdue([1])).toEqual(new Set());
      await Promise.all([
        delivery.run(1, identity, send),
        delivery.run(1, identity, send),
      ]);
      expect(send).toHaveBeenCalledTimes(1);
      expect(store.receipts).toEqual([{ taskId: 1, kind, sentAt: new Date() }]);
    },
  );

  it.each(['OVERDUE', 'sent:hourly:3'])(
    'recovers an undatable legacy epoch reservation: %s',
    async (kind) => {
      const store = receiptStore();
      store.receipts.push({ taskId: 1, kind, sentAt: new Date(0) });
      const delivery = new UniqueDelivery(
        store as unknown as PrismaService['client'],
      );
      expect(await delivery.recentOverdue([1])).toEqual(new Set());
      const send = jest.fn().mockResolvedValue(undefined);
      await delivery.run(
        1,
        kind === 'OVERDUE'
          ? { type: 'overdue' }
          : { type: 'channel', key: 'hourly', notificationId: 3 },
        send,
      );
      expect(send).toHaveBeenCalledTimes(1);
      expect(store.receipts).toEqual([{ taskId: 1, kind, sentAt: new Date() }]);
    },
  );

  it('retries after a receipt update failure expires, without permanent suppression', async () => {
    const store = receiptStore();
    const delivery = new UniqueDelivery(
      store as unknown as PrismaService['client'],
    );
    const send = jest.fn().mockResolvedValue(undefined);
    store.notification.updateMany.mockRejectedValueOnce(
      new Error('database unavailable'),
    );
    await expect(delivery.run(1, { type: 'overdue' }, send)).rejects.toThrow(
      'database unavailable',
    );
    expect(await delivery.run(1, { type: 'overdue' }, send)).toBe(false);
    jest.advanceTimersByTime(DELIVERY_LEASE_MS);
    expect(await delivery.run(1, { type: 'overdue' }, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.receipts).toEqual([
      { taskId: 1, kind: 'OVERDUE', sentAt: new Date() },
    ]);
  });

  it.each([false, true])(
    'a late worker cannot acknowledge or delete a replacement lease (failure=%s)',
    async (fail) => {
      const store = receiptStore();
      const delivery = new UniqueDelivery(
        store as unknown as PrismaService['client'],
      );
      let started!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      let finish!: () => void;
      const held = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const first = delivery.run(1, { type: 'overdue' }, async () => {
        started();
        await held;
        if (fail) throw new Error('offline');
      });
      await ready;
      jest.advanceTimersByTime(DELIVERY_LEASE_MS);
      const replacement = {
        taskId: 1,
        kind: 'pending:OVERDUE',
        sentAt: new Date(),
      };
      // Another worker has taken over and is still sending.
      store.receipts.splice(0, 1, replacement);
      const warning = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      const result = fail
        ? expect(first).rejects.toThrow('offline')
        : expect(first).resolves.toBe(true);
      finish();
      await result;
      expect(store.receipts).toEqual([replacement]);
      if (!fail)
        expect(warning).toHaveBeenCalledWith(
          expect.stringContaining('expired after successful send'),
        );
      warning.mockRestore();
    },
  );

  it('uses a rolling 24h window, including across midnight and concurrent runs', async () => {
    const store = receiptStore();
    const delivery = new UniqueDelivery(
      store as unknown as PrismaService['client'],
    );
    const identity = {
      type: 'channel',
      key: 'hourly',
      notificationId: 3,
    } as const;
    const send = jest.fn().mockResolvedValue(undefined);
    await Promise.all([
      delivery.run(1, identity, send),
      delivery.run(1, identity, send),
    ]);
    jest.advanceTimersByTime(23 * 3600_000);
    expect(await delivery.run(1, identity, send)).toBe(false);
    jest.advanceTimersByTime(3600_001);
    expect(await delivery.run(1, identity, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(2);
    expect(store.receipts).toHaveLength(2);
  });
});

describe('reminder caller → channel delivery → receipt', () => {
  it('releases a failed reservation, retries, then suppresses a duplicate', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T19:00:00Z'));
    try {
      const store = receiptStore();
      const deadline = new Date('2026-05-04T20:00:00Z');
      const row = {
        id: 3,
        taskId: 1,
        reminderOffsetMinutes: 60,
        notifyOnReminder: true,
        task: { id: 1 },
        channel: { id: 4, enabled: true, type: 'SLACK', config: '{}' },
      };
      const client = {
        ...store,
        task: { findUnique: jest.fn().mockResolvedValue({ name: 'Task' }) },
        taskNotification: { findMany: jest.fn().mockResolvedValue([row]) },
        site: { findMany: jest.fn().mockResolvedValue([]) },
        status: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const settings = { getRawValue: jest.fn() };
      const service = new NotificationsService(
        { client } as never,
        { decrypt: () => '{"webhookUrl":"https://example.com"}' } as never,
        {} as never,
        settings as never,
        {} as never,
      );
      const job = new ReminderNotificationJob(
        { client } as never,
        settings as never,
        service,
        {
          computeInstances: () => [{ date: deadline, periodEnd: deadline }],
        } as never,
        {
          register: jest.fn(),
        } as never,
      );
      const fetch = jest.mocked(safeFetch);
      fetch
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValue({ ok: true } as Response);
      await job.execute();
      expect(store.receipts).toHaveLength(0);
      await job.execute();
      await job.execute();
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(store.receipts).toEqual([
        { taskId: 1, kind: 'reminder:3:2026-05-04', sentAt: deadline },
      ]);
    } finally {
      jest.useRealTimers();
    }
  });
});
