import { Test, TestingModule } from '@nestjs/testing';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { SettingsService } from '../../settings';
import * as jobs from './index';
import { AuditScheduler } from '../audit.scheduler';
import { DelegationSchedulerService } from '../../modules/delegations/delegation-scheduler.service';
import { JobRunner } from '../job-runner.service';
import { JobLockService } from '../job-lock.service';
import { MemoryJobLock } from '../__mocks__/job-lock';
import { JOB_DEFINITIONS } from '../job-definitions';

/** Discover real @Cron metadata, but never connect any infrastructure. */
describe('Scheduled job lifecycle', () => {
  let module: TestingModule;
  let runner: JobRunner;
  let lock: MemoryJobLock;
  const handlers = new Map<string, jest.SpyInstance>();

  beforeEach(async () => {
    lock = new MemoryJobLock();
    module = await Test.createTestingModule({
      imports: [ScheduleModule.forRoot()],
      providers: [
        ...Object.values(jobs),
        AuditScheduler,
        DelegationSchedulerService,
        JobRunner,
        { provide: JobLockService, useValue: lock },
        {
          provide: SettingsService,
          useValue: { getRawValue: jest.fn().mockResolvedValue(true) },
        },
      ],
    })
      .useMocker(() => ({}))
      .compile();
    runner = module.get(JobRunner);
    for (const Job of Object.values(jobs)) {
      const job = module.get<InstanceType<typeof Job>>(Job);
      handlers.set(
        job.name,
        jest.spyOn(job, 'execute').mockResolvedValue(undefined),
      );
    }
    handlers.set(
      'audit-producer',
      jest
        .spyOn(module.get(AuditScheduler), 'work')
        .mockResolvedValue(undefined),
    );
    handlers.set(
      'delegation-expiry',
      jest
        .spyOn(module.get(DelegationSchedulerService), 'work')
        .mockResolvedValue(undefined),
    );
    await module.init();
    // Prevent timers firing in the test; fireOnTick below exercises Nest's callback.
    module
      .get(SchedulerRegistry)
      .getCronJobs()
      .forEach((job) => job.stop());
  });

  afterEach(async () => {
    await module.close();
    handlers.clear();
  });

  it('has one definition and registered handler for every discovered cron, with no drift', async () => {
    const crons = module.get(SchedulerRegistry).getCronJobs();
    expect([...crons.keys()].sort()).toEqual(
      Object.keys(JOB_DEFINITIONS).sort(),
    );
    for (const [name, cron] of crons) {
      const definition = Object.values(JOB_DEFINITIONS).find(
        (entry) => entry.name === name,
      );
      expect(definition).toBeDefined();
      expect(cron.cronTime.source).toBe(definition!.cron);
      expect((await runner.run(name, 'manual')).status).toBe('success');
    }
  });

  it.each(Object.values(JOB_DEFINITIONS))(
    '$name routes cron and manual execution through the same lock',
    async (definition) => {
      const cron = module.get(SchedulerRegistry).getCronJob(definition.name);
      const run = jest.spyOn(runner, 'run');
      await cron.fireOnTick();
      expect(run).toHaveBeenCalledWith(definition.name, 'cron');
      await run.mock.results[0].value;
      expect(runner.getLastRun(definition.name)?.status).toBe('success');
      expect(handlers.get(definition.name)).toHaveBeenCalledTimes(1);
      lock.held.add(definition.name);
      expect((await runner.run(definition.name, 'manual')).status).toBe(
        'locked',
      );
      expect(handlers.get(definition.name)).toHaveBeenCalledTimes(1);
      lock.held.delete(definition.name);
      handlers
        .get(definition.name)!
        .mockRejectedValueOnce(new Error('work failed'));
      expect(await runner.run(definition.name, 'manual')).toMatchObject({
        status: 'failed',
        error: 'work failed',
      });
      expect(
        lock.calls.every((call) => call.ttl === definition.lockTtlSeconds),
      ).toBe(true);
    },
  );
});
