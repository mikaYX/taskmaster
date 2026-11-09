import { AutoBackupJob } from './auto-backup.job';
import { JobRunner } from '../job-runner.service';
import { MemoryJobLock } from '../__mocks__/job-lock';

describe('AutoBackupJob default', () => {
  afterEach(() => jest.useRealTimers());

  it.each([undefined, false, true])(
    'keeps backup off by default (enabled=%s)',
    async (enabled) => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 10, 9, 0, 0));
      const backup = {
        createSystemSnapshot: jest.fn().mockResolvedValue({ jobId: 'backup' }),
      };
      const settings = {
        getRawValue: jest.fn(async (key: string) =>
          key === 'backup.enabled' ? enabled : undefined,
        ),
      };
      const runner = new JobRunner(
        new MemoryJobLock() as never,
        settings as never,
      );
      const job = new AutoBackupJob(backup as never, settings as never, runner);
      expect((await job.handleCron()).status).toBe('success');
      expect(backup.createSystemSnapshot).toHaveBeenCalledTimes(
        enabled ? 1 : 0,
      );
    },
  );
});
