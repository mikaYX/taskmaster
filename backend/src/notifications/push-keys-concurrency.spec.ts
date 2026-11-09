import * as webpush from 'web-push';
import { PushService } from './push.service';
import { SettingsService } from '../settings/settings.service';
import { EncryptionService } from '../settings/encryption.service';

jest.mock('web-push', () => ({
  generateVAPIDKeys: jest.fn(),
  setVapidDetails: jest.fn(),
}));

describe('concurrent VAPID initialization', () => {
  it('uses one persisted encrypted pair for two independent instances', async () => {
    const rows = new Map<string, { key: string; value: string }>();
    const config = {
      findUnique: jest.fn(async ({ where }) => rows.get(where.key) ?? null),
      upsert: jest.fn(async ({ create, update }) => {
        const row = rows.has(create.key) ? { key: create.key, ...update } : create;
        rows.set(create.key, row);
        return row;
      }),
    };
    let lock = Promise.resolve();
    const client = {
      config,
      $transaction: jest.fn(async (run) => {
        let release!: () => void;
        let held = false;
        const tx = {
          config,
          $queryRaw: jest.fn(async () => {
            const previous = lock;
            lock = new Promise<void>(resolve => { release = resolve; });
            await previous;
            held = true;
            return [];
          }),
        };
        try { return await run(tx); }
        finally { if (held) release(); }
      }),
    };
    const encryption = new EncryptionService({ get: () => 'test-secret-at-least-16' } as never);
    const services = [0, 1].map(() => {
      const settings = new SettingsService({ client } as never, encryption, {} as never);
      return new PushService({ get: () => undefined } as never, { client } as never, settings);
    });
    let generated = 0;
    (webpush.generateVAPIDKeys as jest.Mock).mockImplementation(() => {
      const id = ++generated;
      return { publicKey: `public-${id}`, privateKey: `private-${id}` };
    });

    await Promise.all(services.map(service => service.onModuleInit()));

    expect(services.map(service => service.getPublicKey())).toEqual(['public-1', 'public-1']);
    expect(generated).toBe(1);
    expect(rows.size).toBe(2);
    expect(JSON.parse(rows.get('push.vapid.publicKey')!.value)).toBe('public-1');
    expect(JSON.parse(encryption.decrypt(rows.get('push.vapid.privateKey')!.value))).toBe('private-1');
    expect(webpush.setVapidDetails).toHaveBeenCalledTimes(2);
    for (const call of (webpush.setVapidDetails as jest.Mock).mock.calls) {
      expect(call.slice(1)).toEqual(['public-1', 'private-1']);
    }
  });
});
