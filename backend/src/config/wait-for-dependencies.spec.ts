import { EventEmitter } from 'events';
import * as net from 'net';
import { waitForDependencies } from './wait-for-dependencies';

jest.mock('net', () => ({
  createConnection: jest.fn(),
}));

class FakeSocket extends EventEmitter {
  destroy = jest.fn();
  removeAllListeners = jest.fn(() => {
    super.removeAllListeners();
    return this;
  });
}

describe('waitForDependencies', () => {
  const ORIGINAL_ENV = { ...process.env };
  const createConnectionMock = net.createConnection as unknown as jest.Mock;

  beforeEach(() => {
    createConnectionMock.mockReset();
    jest.useRealTimers();
    delete process.env.DATABASE_URL;
    delete process.env.REDIS_URL;
    delete process.env.TASKMASTER_STARTUP_TIMEOUT_SECONDS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('resolves immediately when neither DATABASE_URL nor REDIS_URL is set', async () => {
    await expect(waitForDependencies()).resolves.toBeUndefined();
    expect(createConnectionMock).not.toHaveBeenCalled();
  });

  it('resolves once both PostgreSQL and Redis connect successfully on the first try', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@db-host:5432/taskmaster';
    process.env.REDIS_URL = 'redis://cache-host:6379';

    createConnectionMock.mockImplementation(() => {
      const socket = new FakeSocket();
      queueMicrotask(() => socket.emit('connect'));
      return socket as unknown as net.Socket;
    });

    await expect(waitForDependencies()).resolves.toBeUndefined();

    const hosts = createConnectionMock.mock.calls.map((call) => call[0]);
    expect(hosts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ host: 'db-host', port: 5432 }),
        expect.objectContaining({ host: 'cache-host', port: 6379 }),
      ]),
    );
  });

  it('retries after a connection error and eventually succeeds', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@db-host:5432/taskmaster';
    let attempt = 0;

    createConnectionMock.mockImplementation(() => {
      const socket = new FakeSocket();
      attempt += 1;
      if (attempt < 3) {
        queueMicrotask(() => socket.emit('error', new Error('ECONNREFUSED')));
      } else {
        queueMicrotask(() => socket.emit('connect'));
      }
      return socket as unknown as net.Socket;
    });

    await expect(waitForDependencies()).resolves.toBeUndefined();
    expect(attempt).toBe(3);
  });

  it('throws a clear timeout error when a dependency never becomes reachable', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@db-host:5432/taskmaster';
    process.env.TASKMASTER_STARTUP_TIMEOUT_SECONDS = '0';

    createConnectionMock.mockImplementation(() => {
      const socket = new FakeSocket();
      queueMicrotask(() => socket.emit('error', new Error('ECONNREFUSED')));
      return socket as unknown as net.Socket;
    });

    await expect(waitForDependencies()).rejects.toThrow(
      /Timed out waiting for PostgreSQL/,
    );
  });
});
