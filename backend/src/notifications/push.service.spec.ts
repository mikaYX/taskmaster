import * as webpush from 'web-push';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  generateVAPIDKeys: jest.fn(() => ({
    publicKey: 'generated-public',
    privateKey: 'generated-private',
  })),
  sendNotification: jest.fn(),
}));

function build(env: Record<string, string | undefined> = {}) {
  const subs = {
    upsert: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(2),
  };
  const stored: Record<string, string> = {};
  const settings = {
    getRawValue: jest.fn((key: string) => Promise.resolve(stored[key] ?? '')),
    set: jest.fn((key: string, value: string) => {
      stored[key] = value;
      return Promise.resolve({});
    }),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => env[key] ?? fallback),
  };
  const service = new PushService(
    config as never,
    { client: { pushSubscription: subs } } as never,
    settings as never,
  );
  return { service, subs, settings, stored };
}

describe('PushService keys', () => {
  beforeEach(() => jest.clearAllMocks());

  it('prefers the keys of the environment', async () => {
    const { service, settings } = build({
      VAPID_PUBLIC_KEY: 'env-public',
      VAPID_PRIVATE_KEY: 'env-private',
    });

    await service.onModuleInit();

    expect(service.getPublicKey()).toBe('env-public');
    expect(service.isEnabled()).toBe(true);
    expect(webpush.generateVAPIDKeys).not.toHaveBeenCalled();
    expect(settings.set).not.toHaveBeenCalled();
  });

  it('generates a pair on the first start and keeps it for the next ones', async () => {
    const { service, settings, stored } = build();

    await service.onModuleInit();

    expect(service.getPublicKey()).toBe('generated-public');
    expect(stored).toEqual({
      'push.vapid.publicKey': 'generated-public',
      'push.vapid.privateKey': 'generated-private',
    });

    // A restart finds the stored pair and does not generate another one.
    const again = new PushService(
      { get: jest.fn() } as never,
      { client: {} } as never,
      settings as never,
    );
    (webpush.generateVAPIDKeys as jest.Mock).mockClear();
    await again.onModuleInit();
    expect(again.getPublicKey()).toBe('generated-public');
    expect(webpush.generateVAPIDKeys).not.toHaveBeenCalled();
  });

  it('stays disabled instead of crashing when the keys cannot be stored', async () => {
    const { service, settings } = build();
    settings.set.mockRejectedValue(new Error('db down'));

    await service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
    expect(service.getPublicKey()).toBeNull();
  });
});

describe('PushService subscriptions and sending', () => {
  beforeEach(() => jest.clearAllMocks());

  it('stores a subscription and attaches it to whoever uses the browser now', async () => {
    const { service, subs } = build();

    await service.subscribe({
      endpoint: 'https://push.example/abc',
      keys: { p256dh: 'p', auth: 'a' },
      userId: 8,
      userAgent: 'Firefox',
    });

    const call = subs.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ endpoint: 'https://push.example/abc' });
    expect(call.create).toMatchObject({ userId: 8, p256dh: 'p', auth: 'a' });
    expect(call.update).toMatchObject({ userId: 8 });
  });

  it('only removes a subscription of the person asking', async () => {
    const { service, subs } = build();

    await service.unsubscribe('https://push.example/abc', 8);

    expect(subs.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://push.example/abc', userId: 8 },
    });
  });

  it('counts the devices of a person', async () => {
    const { service } = build();
    expect(await service.countForUser(8)).toBe(2);
  });

  it('sends to every device and drops the expired ones', async () => {
    const { service, subs } = build({
      VAPID_PUBLIC_KEY: 'k',
      VAPID_PRIVATE_KEY: 's',
    });
    await service.onModuleInit();
    subs.findMany.mockResolvedValue([
      { endpoint: 'https://ok', p256dh: 'p1', auth: 'a1' },
      { endpoint: 'https://gone', p256dh: 'p2', auth: 'a2' },
    ]);
    (webpush.sendNotification as jest.Mock).mockImplementation(
      (sub: { endpoint: string }) =>
        sub.endpoint === 'https://gone'
          ? Promise.reject(
              Object.assign(new Error('gone'), { statusCode: 410 }),
            )
          : Promise.resolve(),
    );

    await service.sendToUser(8, { title: 'T', body: 'B', url: '/todos' });

    expect(webpush.sendNotification).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse((webpush.sendNotification as jest.Mock).mock.calls[0][1]),
    ).toEqual({ title: 'T', body: 'B', url: '/todos' });
    expect(subs.deleteMany).toHaveBeenCalledWith({
      where: { endpoint: 'https://gone' },
    });
  });

  it('does nothing when push is not configured', async () => {
    const { service, subs } = build();

    await service.sendToUser(8, { title: 'T', body: 'B' });

    expect(subs.findMany).not.toHaveBeenCalled();
  });
});
