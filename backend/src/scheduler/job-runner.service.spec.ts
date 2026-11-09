import { JobRunner } from './job-runner.service';
import { JOB_DEFINITIONS } from './job-definitions';
import { MemoryJobLock } from './__mocks__/job-lock';
import { isSchedulerEnabled } from './scheduler-enabled';
import { SETTINGS_REGISTRY } from '../settings/settings.registry';

function buildRunner(value: unknown = true) {
  const lock = new MemoryJobLock();
  const settings = { getRawValue: jest.fn().mockResolvedValue(value) };
  return {
    runner: new JobRunner(lock as never, settings as never),
    lock,
    settings,
  };
}

describe('JobRunner', () => {
  it.each(Object.values(JOB_DEFINITIONS))(
    'runs $name with its TTL and records completion',
    async (definition) => {
      const { runner, lock } = buildRunner();
      const handler = jest.fn().mockResolvedValue(undefined);
      runner.register(definition, handler);
      expect(runner.getLastRun(definition.name)).toBeUndefined();
      const result = await runner.run(definition.name, 'manual');
      expect(result).toMatchObject({
        status: 'success',
        success: true,
        durationMs: expect.any(Number),
        finishedAt: expect.any(String),
      });
      expect(lock.calls).toEqual([
        { name: definition.name, ttl: definition.lockTtlSeconds },
      ]);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(runner.getLastRun(definition.name)).toEqual(result);
    },
  );

  it('excludes concurrent cron/manual work and records the last completed attempt', async () => {
    const { runner } = buildRunner();
    let finish!: () => void;
    const work = new Promise<void>((resolve) => {
      finish = resolve;
    });
    runner.register(JOB_DEFINITIONS['auto-backup'], () => work);
    const first = runner.run('auto-backup', 'manual');
    expect((await runner.run('auto-backup', 'cron')).status).toBe('locked');
    expect(runner.getLastRun('auto-backup')?.status).toBe('locked');
    finish();
    await first;
    expect(runner.getLastRun('auto-backup')?.status).toBe('success');
  });

  it.each(['cron', 'manual'] as const)(
    'converts handler and Redis errors for %s',
    async (trigger) => {
      const { runner, lock } = buildRunner();
      runner.register(JOB_DEFINITIONS['health-check'], async () => {
        throw new Error('database unavailable');
      });
      expect(await runner.run('health-check', trigger)).toMatchObject({
        status: 'failed',
        error: 'database unavailable',
      });
      lock.error = new Error('Redis unavailable');
      expect(await runner.run('health-check', trigger)).toMatchObject({
        status: 'failed',
        error: 'Redis unavailable',
      });
    },
  );

  it('skips paused cron ticks but permits manual runs even when globally disabled', async () => {
    const { runner, settings, lock } = buildRunner(false);
    const handler = jest.fn().mockResolvedValue(undefined);
    runner.register(JOB_DEFINITIONS['health-check'], handler);
    expect((await runner.run('health-check', 'cron')).status).toBe('skipped');
    settings.getRawValue.mockResolvedValue(true);
    runner.setPaused('health-check', true);
    expect((await runner.run('health-check', 'cron')).status).toBe('skipped');
    expect(lock.calls).toHaveLength(0);
    expect(runner.getLastRun('health-check')).toBeUndefined();
    settings.getRawValue.mockResolvedValue(false);
    expect((await runner.run('health-check', 'manual')).status).toBe('success');
  });

  it('measures work duration and protects the in-memory result from callers', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-09T12:00:00Z'));
    try {
      const { runner } = buildRunner();
      runner.register(JOB_DEFINITIONS['health-check'], async () => {
        jest.advanceTimersByTime(75);
      });
      const result = await runner.run('health-check', 'manual');
      expect(result.durationMs).toBe(75);
      expect(result.finishedAt).toBe('2026-11-09T12:00:00.075Z');
      result.message = 'changed by caller';
      expect(runner.getLastRun('health-check')?.message).toBe(
        'health-check job executed',
      );
      const copy = runner.getLastRun('health-check')!;
      copy.status = 'failed';
      expect(runner.getLastRun('health-check')?.status).toBe('success');
      runner.setPaused('health-check', true);
      await runner.run('health-check', 'cron');
      expect(runner.getLastRun('health-check')?.status).toBe('success');
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects duplicate registrations and reports unknown jobs', async () => {
    const { runner } = buildRunner();
    runner.register(JOB_DEFINITIONS['health-check'], async () => {});
    expect(() =>
      runner.register(JOB_DEFINITIONS['health-check'], async () => {}),
    ).toThrow('Duplicate job');
    expect(await runner.run('unknown', 'manual')).toMatchObject({
      status: 'failed',
      message: 'Unknown job: unknown',
    });
  });

  it.each([true, 'true', false, 'false', undefined, null])(
    'parses the global flag consistently: %s',
    async (value) => {
      const { settings } = buildRunner(value);
      settings.getRawValue.mockResolvedValue(value);
      expect(await isSchedulerEnabled(settings as never)).toBe(
        value == null
          ? SETTINGS_REGISTRY['scheduler.enabled'].default
          : value === true || value === 'true',
      );
    },
  );
});
