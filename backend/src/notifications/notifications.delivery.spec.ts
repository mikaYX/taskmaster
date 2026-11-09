import { receiptStore } from './__mocks__/receipt-store';
import { NotificationsService } from './notifications.service';

describe('notification delivery acknowledgement', () => {
  afterEach(() => jest.useRealTimers());
  it('propagates failure and retries only channels not yet delivered', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-04T19:00:00Z'));
    const store = receiptStore();
    const receipts = store.receipts;
    const client = {
      ...store,
      task: { findUnique: jest.fn(async () => ({ name: 'Task' })) },
      taskNotification: {
        findMany: jest.fn(async () =>
          [1, 2, 3].map((id) => ({
            id,
            channelId: id,
            notifyOnMissing: true,
            channel: { enabled: true, type: 'EMAIL' },
          })),
        ),
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
    expect(receipts).toHaveLength(2);
    jest.advanceTimersByTime(300000);
    await service.dispatchTaskNotifications(1, 'OVERDUE', context as any);
    await service.dispatchTaskNotifications(1, 'OVERDUE', context as any);
    expect(send).toHaveBeenCalledTimes(4);
    expect(receipts).toHaveLength(3);
  });
});

describe('channel isolation', () => {
  it.each([
    ['FAILED', undefined, false],
    ['OVERDUE', undefined, true],
    ['REMINDER', { awaitDelivery: true }, true],
  ] as const)(
    'continues after decryption failure for %s, then propagates when required',
    async (event, context, rejects) => {
      const service = new NotificationsService(
        {
          client: {
            task: { findUnique: jest.fn().mockResolvedValue({ name: 'Task' }) },
            taskNotification: {
              findMany: jest.fn().mockResolvedValue(
                [1, 2].map((id) => ({
                  id,
                  channelId: id,
                  notifyOnFailed: true,
                  notifyOnMissing: true,
                  notifyOnReminder: true,
                  channel: {
                    id,
                    enabled: true,
                    type: 'SLACK',
                    config: id === 1 ? 'broken' : 'valid',
                  },
                })),
              ),
            },
          },
        } as never,
        {
          decrypt: (value: string) => {
            if (value === 'broken') throw new Error('secret parser contents');
            return '{"webhookUrl":"https://example.com"}';
          },
        } as never,
        {} as never,
        {} as never,
        {} as never,
      );
      const send = jest
        .spyOn(service as any, 'sendToChannel')
        .mockResolvedValue(undefined);
      const log = jest.spyOn(service['logger'], 'error').mockImplementation();
      const result = service.dispatchTaskNotifications(1, event, context);
      if (rejects)
        await expect(result).rejects.toThrow(
          'Failed to decrypt config for channel 1',
        );
      else await expect(result).resolves.toBeUndefined();
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toMatchObject({
        config: { webhookUrl: 'https://example.com' },
      });
      expect(log).toHaveBeenCalled();
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        'secret parser contents',
      );
      log.mockRestore();
    },
  );

  it('continues after transport failure and broadcast uses the same delivery boundary', async () => {
    const channels = [1, 2].map((id) => ({
      id,
      type: 'SLACK',
      enabled: true,
      config: '{}',
    }));
    const service = new NotificationsService(
      {
        client: {
          notificationChannel: {
            findMany: jest.fn().mockResolvedValue(channels),
          },
        },
      } as never,
      { decrypt: (value: string) => value } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const send = jest
      .spyOn(service as any, 'sendToChannel')
      .mockRejectedValueOnce(new Error('secret transport details'))
      .mockResolvedValueOnce(undefined);
    const log = jest.spyOn(service['logger'], 'error').mockImplementation();
    await service.broadcast([1, 2], 'Subject', []);
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain(
      'secret transport details',
    );
    log.mockRestore();
  });
});
