import { schedulerFixture } from './__mocks__/scheduler';

describe('SchedulerService pause/resume', () => {
  it('stops all jobs and skips startup audit when globally disabled', async () => {
    const { service, job, audit } = schedulerFixture(false);
    await service.onApplicationBootstrap();
    expect(job.stop).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
    expect((await service.getJobsStatus())[0].enabled).toBe(false);
  });

  it('exposes a manual pause through the public API and still permits manual execution', async () => {
    const { service, runner, job, work } = schedulerFixture();
    expect(service.toggleJob('health-check').enabled).toBe(false);
    expect(job.stop).toHaveBeenCalledTimes(1);
    expect((await service.getJobsStatus())[0].enabled).toBe(false);
    expect((await runner.run('health-check', 'cron')).status).toBe('skipped');
    expect(work).not.toHaveBeenCalled();
    expect((await service.triggerJob('health-check')).status).toBe('success');
    expect(service.toggleJob('health-check').enabled).toBe(true);
    expect(job.start).toHaveBeenCalledTimes(1);
    expect((await service.getJobsStatus())[0].enabled).toBe(true);
  });

  it('resets individual pauses on global resume, preserving existing behavior', async () => {
    const { service, settings, job } = schedulerFixture();
    service.toggleJob('health-check');
    settings.getRawValue.mockResolvedValue(false);
    expect((await service.syncSchedulerState()).enabled).toBe(false);
    settings.getRawValue.mockResolvedValue(true);
    expect((await service.syncSchedulerState()).enabled).toBe(true);
    expect(job.start).toHaveBeenCalledTimes(1);
    expect((await service.getJobsStatus())[0].enabled).toBe(true);
  });

  it('reports an unknown toggle without changing known jobs', () => {
    const { service, job } = schedulerFixture();
    expect(service.toggleJob('unknown').success).toBe(false);
    expect(job.stop).not.toHaveBeenCalled();
  });
});
