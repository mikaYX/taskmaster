import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SettingsService } from '../settings';
import {
    CleanupExportsJob,
    CleanupBackupsJob,
    HealthCheckJob,
    AutoExportJob,
    AutoBackupJob,
    MissingTasksNotificationJob,
    ReminderNotificationJob,
} from './jobs';
import { AuditScheduler } from './audit.scheduler';

const mockJob = () => ({
    start: jest.fn(),
    stop: jest.fn(),
    _isActive: true,
    running: undefined,
    cronTime: { source: '0 0 * * *' },
    nextDate: () => new Date(),
});

const makeModule = async (settingsEnabled: boolean) => {
    const job = mockJob();
    const module: TestingModule = await Test.createTestingModule({
        providers: [
            SchedulerService,
            {
                provide: SchedulerRegistry,
                useValue: {
                    getCronJobs: jest.fn().mockReturnValue(new Map([['test-job', job]])),
                    getCronJob: jest.fn().mockReturnValue(job),
                },
            },
            {
                provide: SettingsService,
                useValue: { getRawValue: jest.fn().mockResolvedValue(settingsEnabled) },
            },
            { provide: CleanupExportsJob, useValue: {} },
            { provide: CleanupBackupsJob, useValue: {} },
            { provide: HealthCheckJob, useValue: {} },
            { provide: AutoExportJob, useValue: {} },
            { provide: AutoBackupJob, useValue: {} },
            { provide: MissingTasksNotificationJob, useValue: {} },
            { provide: ReminderNotificationJob, useValue: {} },
            { provide: AuditScheduler, useValue: {} },
        ],
    }).compile();

    return { module, job };
};

describe('SchedulerService (Pause/Resume)', () => {
    it('should stop all jobs on bootstrap if scheduler is disabled', async () => {
        const { module, job } = await makeModule(false);
        const service = module.get<SchedulerService>(SchedulerService);

        service['schedulerRegistry'].getCronJobs = jest.fn().mockReturnValue(new Map([['test-job', job]]));
        await service.onApplicationBootstrap();

        expect(job.stop).toHaveBeenCalled();
    });

    it('should track paused job in disabledJobs and return enabled:false', () => {
        const { module } = makeModule(true) as any;
        // Direct instantiation test for toggleJob use disabledJobs
        const job = mockJob();
        const service = new SchedulerService(
            { getCronJobs: jest.fn().mockReturnValue(new Map([['j', job]])), getCronJob: jest.fn().mockReturnValue(job) } as any,
            { getRawValue: jest.fn().mockResolvedValue(true) } as any,
            {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        );

        // First toggle: should stop
        const r1 = service.toggleJob('j');
        expect(job.stop).toHaveBeenCalled();
        expect(r1.enabled).toBe(false);
        expect((service as any).disabledJobs.has('j')).toBe(true);

        // Second toggle: should start
        const r2 = service.toggleJob('j');
        expect(job.start).toHaveBeenCalled();
        expect(r2.enabled).toBe(true);
        expect((service as any).disabledJobs.has('j')).toBe(false);
    });

    it('getJobsStatus returns enabled:false for disabled job even if _isActive is true', async () => {
        const job = mockJob();
        job._isActive = true; // still true in cron lib even after stop()
        const service = new SchedulerService(
            { getCronJobs: jest.fn().mockReturnValue(new Map([['j', job]])) } as any,
            { getRawValue: jest.fn().mockResolvedValue(true) } as any,
            {} as any, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any,
        );

        // Manually mark job as disabled
        (service as any).disabledJobs.add('j');

        const status = await service.getJobsStatus();
        expect(status[0].enabled).toBe(false);
    });
});
