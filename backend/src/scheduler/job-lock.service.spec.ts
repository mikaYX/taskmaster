import { JobLockService } from './job-lock.service';

describe('JobLockService ownership', () => {
  it('does not release a replacement lock after the original lease expires', async () => {
    let value: string | undefined;
    const redis = {
      set: jest.fn(async (_key, token) => {
        if (value) return null;
        value = token;
        return 'OK';
      }),
      del: jest.fn(async () => {
        value = undefined;
      }),
      eval: jest.fn(async (_script, _count, _key, token) => {
        if (value === token) value = undefined;
      }),
    };
    const service = new JobLockService(redis as never);
    let finish!: () => void;
    const first = service.withLock(
      'test',
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    await Promise.resolve();
    value = undefined; // Redis expires A's lease.
    let finishSecond!: () => void;
    const second = service.withLock(
      'test',
      () =>
        new Promise<void>((resolve) => {
          finishSecond = resolve;
        }),
    );
    await Promise.resolve();
    finish();
    await first;
    const third = jest.fn();
    expect((await service.withLock('test', third)).success).toBe(false);
    expect(third).not.toHaveBeenCalled();
    finishSecond();
    await second;
  });
});

describe('JobLockService.withLock result', () => {
  const build = (setResult: 'OK' | null) => {
    const redis = {
      set: jest.fn().mockResolvedValue(setResult),
      eval: jest.fn().mockResolvedValue(1),
    };
    return new JobLockService(redis as never);
  };

  it('says so when the lock is already taken', async () => {
    const run = jest.fn();
    await expect(build(null).withLock('job', run)).resolves.toMatchObject({
      success: false,
      status: 'locked',
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('carries the error of a failed run', async () => {
    await expect(
      build('OK').withLock('job', () => Promise.reject(new Error('boom'))),
    ).resolves.toMatchObject({
      success: false,
      status: 'failed',
      error: 'boom',
    });
  });

  it('reports success otherwise', async () => {
    await expect(
      build('OK').withLock('job', () => Promise.resolve()),
    ).resolves.toMatchObject({ success: true, status: 'success' });
  });
});
