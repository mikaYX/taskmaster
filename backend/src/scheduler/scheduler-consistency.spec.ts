import { schedulerFixture } from './__mocks__/scheduler';
import { SETTINGS_REGISTRY } from '../settings/settings.registry';

describe('Scheduler global flag consistency', () => {
  it.each([true, 'true', false, 'false', undefined, null])(
    'uses one interpretation at bootstrap, status, sync and cron: %s',
    async (value) => {
      const { service, settings, runner, job } = schedulerFixture();
      settings.getRawValue.mockResolvedValue(value);
      const enabled =
        value == null
          ? SETTINGS_REGISTRY['scheduler.enabled'].default
          : value === true || value === 'true';
      await service.onApplicationBootstrap();
      expect(job.stop).toHaveBeenCalledTimes(enabled ? 0 : 1);
      expect((await service.getJobsStatus())[0].enabled).toBe(enabled);
      expect((await service.syncSchedulerState()).enabled).toBe(enabled);
      expect((await runner.run('health-check', 'cron')).status).toBe(
        enabled ? 'success' : 'skipped',
      );
    },
  );
});
