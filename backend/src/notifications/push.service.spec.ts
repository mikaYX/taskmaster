import { lookup } from 'node:dns/promises';
import * as webpush from 'web-push';
import { PushService } from './push.service';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
beforeEach(() => {
  (lookup as jest.Mock).mockResolvedValue([{ address: '8.8.8.8', family: 4 }]);
});

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
  // The settings service owns atomic persistence; these tests cover push setup.
  const getOrCreateVapidKeys = jest.fn(
    async (generate: () => { publicKey: string; privateKey: string }) => {
      if (stored['push.vapid.publicKey'] && stored['push.vapid.privateKey']) {
        return {
          publicKey: stored['push.vapid.publicKey'],
          privateKey: stored['push.vapid.privateKey'],
        };
      }
      const keys = generate();
      await settings.set('push.vapid.publicKey', keys.publicKey);
      await settings.set('push.vapid.privateKey', keys.privateKey);
      return keys;
    },
  );
  Object.assign(settings, { getOrCreateVapidKeys });
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

describe('PushService SSRF protection', () => {
  const blocked = [
    'https://127.0.0.1/x',
    'https://10.0.0.1/x',
    'https://172.16.0.1/x',
    'https://192.168.0.1/x',
    'https://169.254.169.254/x',
    'https://[::1]/x',
    'https://[fd12::1]/x',
    'https://[febf::1]/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://2130706433/x',
    'http://push.example/x',
    'https://user:password@push.example/x',
  ];
  beforeEach(() => jest.clearAllMocks());
  it.each(blocked)('rejects registration of %s', async (endpoint) => {
    const { service, subs } = build();
    await expect(
      service.subscribe({
        endpoint,
        keys: { p256dh: 'p', auth: 'a' },
        userId: 8,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(subs.upsert).not.toHaveBeenCalled();
  });
  it('rejects a hostname with any private DNS answer', async () => {
    (lookup as jest.Mock).mockResolvedValue([
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]);
    const { service, subs } = build();
    await expect(
      service.subscribe({
        endpoint: 'https://push.example/x',
        keys: { p256dh: 'p', auth: 'a' },
        userId: 8,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(subs.upsert).not.toHaveBeenCalled();
  });
  it('revalidates DNS before sending a stored subscription', async () => {
    const { service, subs } = build();
    await service.onModuleInit();
    await service.subscribe({
      endpoint: 'https://push.example/x',
      keys: { p256dh: 'p', auth: 'a' },
      userId: 8,
    });
    subs.findMany.mockResolvedValue([
      { endpoint: 'https://push.example/x', p256dh: 'p', auth: 'a' },
    ]);
    (lookup as jest.Mock).mockResolvedValue([
      { address: '169.254.169.254', family: 4 },
    ]);
    await service.sendToUser(8, { title: 'T', body: 'B' });
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });
  it('pins the connection to the validated public address', async () => {
    const { service, subs } = build();
    await service.onModuleInit();
    subs.findMany.mockResolvedValue([
      { endpoint: 'https://push.example/x', p256dh: 'p', auth: 'a' },
    ]);
    (webpush.sendNotification as jest.Mock).mockResolvedValue({});
    await service.sendToUser(8, { title: 'T', body: 'B' });
    const agent = (webpush.sendNotification as jest.Mock).mock.calls[0][2]
      ?.agent;
    expect(agent).toBeDefined();
    const callback = jest.fn();
    agent.options.lookup('push.example', { all: true }, callback);
    expect(callback).toHaveBeenCalledWith(null, [
      { address: '8.8.8.8', family: 4 },
    ]);
  });
});
