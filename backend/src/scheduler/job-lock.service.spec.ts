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
