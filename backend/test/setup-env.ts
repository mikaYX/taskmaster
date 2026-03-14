/**
 * Setup file for E2E tests.
 * Ensures that necessary environment variables are set to avoid validation failures.
 */
process.env.NODE_ENV = 'test';

// Required by env.validation.ts
if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
  process.env.AUTH_SECRET = 'test-secret-at-least-32-chars-long-for-e2e';
}

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://taskmaster:taskmaster_dev@localhost:5432/taskmaster';
}

// Dummy vars to enable/mock external flows during tests
process.env.GOOGLE_CLIENT_ID = 'dummy-google-id';
process.env.GOOGLE_CLIENT_SECRET = 'dummy-google-secret';
process.env.AZURE_AD_CLIENT_ID = 'dummy-azure-id';
process.env.AZURE_AD_CLIENT_SECRET = 'dummy-azure-secret';
process.env.AZURE_AD_TENANT_ID = 'common';
process.env.SAML_ENTRY_POINT = 'http://localhost/saml';
process.env.SAML_ISSUER = 'taskmaster-test';
process.env.SAML_CERT = 'dummy-cert';

// Redirect Redis to localhost instead of docker 'redis' service for local E2E runs
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'redis://localhost:6379';
}

// Mock ioredis to avoid connection errors during tests
jest.mock('ioredis', () => {
  const EventEmitter = require('events');
  type RedisEntry = { value: string; expiresAt?: number };

  class MockRedis extends EventEmitter {
    private store = new Map<string, RedisEntry>();

    constructor() {
      super();
      // Simulate async connection
      setTimeout(() => this.emit('ready'), 0);
    }

    private cleanupIfExpired(key: string) {
      const entry = this.store.get(key);
      if (!entry?.expiresAt) return;
      if (entry.expiresAt <= Date.now()) {
        this.store.delete(key);
      }
    }

    private parseExpiry(args: unknown[]): number | undefined {
      if (args.length < 2) return undefined;
      const mode = String(args[0] ?? '').toUpperCase();
      const ttl = Number(args[1]);

      if (!Number.isFinite(ttl) || ttl <= 0) return undefined;
      if (mode === 'EX') return Date.now() + ttl * 1000;
      if (mode === 'PX') return Date.now() + ttl;
      return undefined;
    }

    get = jest.fn(async (key: string) => {
      this.cleanupIfExpired(key);
      const entry = this.store.get(key);
      return entry ? entry.value : null;
    });

    set = jest.fn(async (key: string, value: unknown, ...args: unknown[]) => {
      const expiresAt = this.parseExpiry(args);
      this.store.set(key, { value: String(value), expiresAt });
      return 'OK';
    });

    del = jest.fn(async (...keys: string[]) => {
      let count = 0;
      for (const key of keys) {
        if (this.store.delete(key)) {
          count += 1;
        }
      }
      return count;
    });

    incr = jest.fn(async (key: string) => {
      this.cleanupIfExpired(key);
      const entry = this.store.get(key);
      const current = entry ? Number.parseInt(entry.value, 10) || 0 : 0;
      const next = current + 1;
      this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt });
      return next;
    });

    expire = jest.fn(async (key: string, seconds: number) => {
      this.cleanupIfExpired(key);
      const entry = this.store.get(key);
      if (!entry) return 0;
      this.store.set(key, {
        value: entry.value,
        expiresAt: Date.now() + Number(seconds) * 1000,
      });
      return 1;
    });

    quit = jest.fn().mockResolvedValue('OK');
    on = jest.fn().mockImplementation((event, cb) => {
      if (event === 'ready') setTimeout(cb, 0);
      return this;
    });
    defineCommand = jest.fn();
  }
  return MockRedis;
});

// Mock bullmq to avoid connection errors during tests
jest.mock('bullmq', () => {
  class MockQueue {
    add = jest.fn().mockResolvedValue({ id: '1' });
    process = jest.fn();
    on = jest.fn();
    close = jest.fn();
  }
  class MockWorker {
    on = jest.fn();
    close = jest.fn();
  }
  return {
    Queue: MockQueue,
    Worker: MockWorker,
    QueueEvents: class {},
  };
});

// Disable logging for cleaner test output
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL = 'error';
}
