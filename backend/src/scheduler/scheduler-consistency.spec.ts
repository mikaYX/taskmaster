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

describe('Scheduler Service - Global Toggle Consistency', () => {
    let service: SchedulerService;
    let settingsService: SettingsService;
    let registry: SchedulerRegistry;

    const mockJob = (name: string) => ({
        _isActive: true, // Physiquement "actif" dans le thread
        cronTime: { source: '0 0 * * *' },
        nextDate: () => new Date(),
        stop: jest.fn(),
        start: jest.fn(),
    });

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                SchedulerService,
                {
                    provide: SchedulerRegistry,
                    useValue: {
                        getCronJobs: jest.fn().mockReturnValue(new Map([['test-job', mockJob('test-job')]])),
                    },
                },
                {
                    provide: SettingsService,
                    useValue: {
                        getRawValue: jest.fn(),
                    },
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

        service = module.get<SchedulerService>(SchedulerService);
        settingsService = module.get<SettingsService>(SettingsService);
        registry = module.get<SchedulerRegistry>(SchedulerRegistry);
    });

    it('should return enabled: false for all jobs when scheduler.enabled is false', async () => {
        (settingsService.getRawValue as jest.Mock).mockResolvedValue(false);

        const status = await service.getJobsStatus();

        expect(status[0].enabled).toBe(false);
    });

    it('should return enabled: true when scheduler.enabled is true and job is active', async () => {
        (settingsService.getRawValue as jest.Mock).mockResolvedValue(true);

        const status = await service.getJobsStatus();

        expect(status[0].enabled).toBe(true);
    });
});
