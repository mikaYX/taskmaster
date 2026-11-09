import { SchedulerService } from './scheduler.service';

describe('SchedulerService.triggerJob', () => {
  const job = () => ({ execute: jest.fn().mockResolvedValue(undefined) });
  const registry = { getCronJob: jest.fn() };
  const build = () => {
    const jobs = {
      cleanupExports: job(),
      cleanupBackups: job(),
      health: job(),
      autoExport: job(),
      autoBackup: job(),
      alerts: job(),
      reminders: job(),
    };
    const audit = {
      auditMissedInstances: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SchedulerService(
      registry as never,
      { getRawValue: jest.fn() } as never,
      jobs.cleanupExports as never,
      jobs.cleanupBackups as never,
      jobs.health as never,
      jobs.autoExport as never,
      jobs.autoBackup as never,
      jobs.alerts as never,
      jobs.reminders as never,
      audit as never,
    );
    return { service, jobs, audit };
  };

  beforeEach(() => jest.resetAllMocks());

  it('reports success when the job ran', async () => {
    const { service, jobs } = build();
    jobs.health.execute.mockResolvedValue(undefined);

    await expect(service.triggerJob('health-check')).resolves.toMatchObject({
      success: true,
      status: 'success',
    });
  });

  it('reports a job that was skipped because its lock is held', async () => {
    const { service, jobs } = build();
    jobs.reminders.execute.mockResolvedValue({
      success: false,
      status: 'locked',
      message: 'Job is already running',
    });

    await expect(service.triggerJob('email-reminders')).resolves.toEqual({
      success: false,
      status: 'locked',
      message: 'Job is already running',
    });
  });

  it('reports the error of a job that failed inside its lock', async () => {
    const { service, jobs } = build();
    jobs.alerts.execute.mockResolvedValue({
      success: false,
      status: 'failed',
      error: 'smtp down',
      message: 'Execution failed: smtp down',
    });

    await expect(service.triggerJob('email-alerts')).resolves.toMatchObject({
      success: false,
      status: 'failed',
      error: 'smtp down',
    });
  });

  it('reports a job that throws instead of claiming success', async () => {
    const { service, audit } = build();
    audit.auditMissedInstances.mockRejectedValue(new Error('db down'));

    await expect(service.triggerJob('audit-producer')).resolves.toMatchObject({
      success: false,
      status: 'failed',
      error: 'db down',
    });
  });

  it('reports an unknown job', async () => {
    const { service } = build();
    registry.getCronJob.mockImplementation(() => {
      throw new Error('not found');
    });

    await expect(service.triggerJob('nope')).resolves.toMatchObject({
      success: false,
      message: 'Unknown job: nope',
    });
  });

  it('reports a failure of the generic cron fallback', async () => {
    const { service } = build();
    registry.getCronJob.mockReturnValue({
      fireOnTick: jest.fn().mockRejectedValue(new Error('boom')),
    });

    await expect(service.triggerJob('custom')).resolves.toMatchObject({
      success: false,
      status: 'failed',
      error: 'boom',
    });
  });
});
