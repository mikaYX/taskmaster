import { SchedulerService } from '../scheduler.service';
import { JobRunner } from '../job-runner.service';
import { JOB_DEFINITIONS } from '../job-definitions';
import { MemoryJobLock } from './job-lock';

export function schedulerFixture(value: unknown = true) {
  const job = {
    start: jest.fn(),
    stop: jest.fn(),
    nextDate: () => ({ toJSDate: () => new Date('2026-11-10T00:00:00Z') }),
  };
  const registry = {
    getCronJobs: () => new Map([['health-check', job]]),
    getCronJob: jest.fn((name: string) => {
      if (name !== 'health-check') throw new Error('unknown job');
      return job;
    }),
  };
  const settings = { getRawValue: jest.fn().mockResolvedValue(value) };
  const lock = new MemoryJobLock();
  const runner = new JobRunner(lock as never, settings as never);
  const work = jest.fn().mockResolvedValue(undefined);
  const audit = jest.fn().mockResolvedValue(undefined);
  runner.register(JOB_DEFINITIONS['health-check'], work);
  runner.register(JOB_DEFINITIONS['audit-producer'], audit);
  const service = new SchedulerService(
    registry as never,
    settings as never,
    runner,
  );
  return { service, runner, settings, lock, work, audit, job, registry };
}
