import { receiptStore } from '../notifications/__mocks__/receipt-store';
import { DELIVERY_LEASE_MS } from '../notifications/unique-delivery';
import { AuditScheduler } from './audit.scheduler';

describe('Audit OVERDUE delivery', () => {
  const date = new Date('2026-05-04T00:00:00Z');
  let statuses: any[];
  const store = receiptStore();
  const receipts = store.receipts;
  const client = {
    ...store,
    task: { findMany: jest.fn(async () => [{ id: 1 }]) },
    site: { findMany: jest.fn(async () => []) },
    status: {
      findMany: jest.fn(async () => statuses),
      create: jest.fn(async ({ data }) => {
        statuses.push(data);
        return data;
      }),
    },
  };
  const dispatchTaskNotifications = jest.fn();
  const scheduler = new AuditScheduler(
    { client } as never,
    {
      computeInstances: () => [
        { date, periodEnd: new Date('2026-05-04T18:00:00Z') },
      ],
    } as never,
    {} as never,
    { getRawValue: jest.fn() } as never,
    { dispatchTaskNotifications } as never,
  );
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T19:00:00Z'));
    jest.clearAllMocks();
    statuses = [];
    receipts.length = 0;
    dispatchTaskNotifications.mockImplementation(async () => {
      expect(statuses[0].status).toBe('MISSING');
    });
  });
  afterEach(() => jest.useRealTimers());
  it('retries MISSING after failure, without resending a successful alert', async () => {
    dispatchTaskNotifications.mockRejectedValueOnce(new Error('offline'));
    await expect(scheduler.auditMissedInstances()).rejects.toThrow('offline');
    expect(receipts).toHaveLength(0);
    jest.advanceTimersByTime(300000);
    await scheduler.auditMissedInstances();
    jest.advanceTimersByTime(300000);
    await scheduler.auditMissedInstances();
    expect(client.status.create).toHaveBeenCalledTimes(1);
    expect(dispatchTaskNotifications).toHaveBeenCalledTimes(2);
    expect(receipts).toHaveLength(1);
  });
  it('retries a crashed audit lease and ignores pending rows in auditReceipts', async () => {
    statuses.push({ taskId: 1, instanceDate: date, status: 'MISSING' });
    receipts.push({
      taskId: 1,
      kind: 'pending:audit:2026-05-04',
      sentAt: new Date(),
    });
    await scheduler.auditMissedInstances();
    expect(dispatchTaskNotifications).not.toHaveBeenCalled();
    jest.advanceTimersByTime(DELIVERY_LEASE_MS);
    await scheduler.auditMissedInstances();
    await scheduler.auditMissedInstances();
    expect(dispatchTaskNotifications).toHaveBeenCalledTimes(1);
    expect(receipts[0].kind).toBe('audit:2026-05-04');
  });
});
