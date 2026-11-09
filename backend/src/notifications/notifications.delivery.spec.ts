import { NotificationsService } from './notifications.service';

describe('notification delivery acknowledgement', () => {
  afterEach(() => jest.useRealTimers());
  it('propagates failure and retries only channels not yet delivered', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T19:00:00Z'));
    const receipts: any[] = [];
    const client = {
      task: { findUnique: jest.fn(async () => ({ name: 'Task' })) },
      taskNotification: {
        findMany: jest.fn(async () =>
          [1, 2].map((id) => ({
            id,
            channelId: id,
            notifyOnMissing: true,
            channel: { enabled: true, type: 'EMAIL' },
          })),
        ),
      },
      notification: {
        findFirst: jest.fn(async ({ where }) =>
          receipts.find((r) => r.kind === where.kind),
        ),
        create: jest.fn(async ({ data }) => {
          receipts.push(data);
        }),
      },
    };
    const service = new NotificationsService(
      { client } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const send = jest
      .spyOn(service as any, 'sendToChannel')
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(undefined);
    const context = { deliveryKey: 'audit:2026-05-04' };
    await expect(
      service.dispatchTaskNotifications(1, 'OVERDUE', context as any),
    ).rejects.toThrow('offline');
    expect(receipts).toHaveLength(1);
    jest.advanceTimersByTime(300000);
    await service.dispatchTaskNotifications(1, 'OVERDUE', context as any);
    await service.dispatchTaskNotifications(1, 'OVERDUE', context as any);
    expect(send).toHaveBeenCalledTimes(3);
    expect(receipts).toHaveLength(2);
  });
});
