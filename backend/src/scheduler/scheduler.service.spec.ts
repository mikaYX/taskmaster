import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { JobsController } from './scheduler.controller';
import { schedulerFixture } from './__mocks__/scheduler';

describe('SchedulerService', () => {
  it('reports success and exposes the same last run with the central definition', async () => {
    const { service, work } = schedulerFixture();
    expect((await service.getJobsStatus())[0].lastRun).toBeUndefined();
    const result = await service.triggerJob('health-check');
    expect(result).toMatchObject({
      status: 'success',
      message: 'health-check job executed',
    });
    expect(work).toHaveBeenCalledTimes(1);
    expect((await service.getJobsStatus())[0]).toMatchObject({
      cron: '*/5 * * * *',
      description: 'System health monitoring',
      lastRun: result,
    });
  });

  it('returns locked, failed and unknown results without a cron fallback', async () => {
    const { service, lock, work, registry } = schedulerFixture();
    lock.held.add('health-check');
    expect((await service.triggerJob('health-check')).status).toBe('locked');
    lock.held.clear();
    work.mockRejectedValueOnce(new Error('db down'));
    expect(await service.triggerJob('health-check')).toMatchObject({
      status: 'failed',
      error: 'db down',
    });
    expect(await service.triggerJob('unknown')).toMatchObject({
      status: 'failed',
      message: 'Unknown job: unknown',
    });
    expect(registry.getCronJob).not.toHaveBeenCalled();
  });

  it('runs the startup audit through the same lock as its first cron tick', async () => {
    const { service, runner, audit, lock } = schedulerFixture();
    let finish!: () => void;
    audit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const run = jest.spyOn(runner, 'run');
    await service.onApplicationBootstrap();
    expect(run).toHaveBeenCalledWith('audit-producer', 'cron');
    expect((await runner.run('audit-producer', 'cron')).status).toBe('locked');
    expect(audit).toHaveBeenCalledTimes(1);
    expect(lock.calls[0]).toEqual({ name: 'audit-producer', ttl: 600 });
    finish();
    await run.mock.results[0].value;
  });

  it('keeps HTTP 200 for run outcomes, including failed and unknown jobs', async () => {
    const { service, lock } = schedulerFixture();
    const controller = new JobsController(service);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, controller.triggerJob)).toBe(
      200,
    );
    lock.error = new Error('Redis unavailable');
    expect((await controller.triggerJob('health-check')).status).toBe('failed');
    expect((await controller.triggerJob('unknown')).status).toBe('failed');
  });
});
