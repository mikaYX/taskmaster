import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SettingsService } from '../settings';
import { AuditScheduler } from './audit.scheduler';
import type { JobExecutionResult } from './scheduler.interface';
import {
  AutoBackupJob,
  AutoExportJob,
  CleanupBackupsJob,
  CleanupExportsJob,
  HealthCheckJob,
  MissingTasksNotificationJob,
  ReminderNotificationJob,
} from './jobs';

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);
  // Source of truth for job enabled state - independent of _isActive
  private readonly disabledJobs = new Set<string>();

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly cleanupExportsJob: CleanupExportsJob,
    private readonly cleanupBackupsJob: CleanupBackupsJob,
    private readonly healthCheckJob: HealthCheckJob,
    private readonly autoExportJob: AutoExportJob,
    private readonly autoBackupJob: AutoBackupJob,
    private readonly missingTasksNotificationJob: MissingTasksNotificationJob,
    private readonly reminderNotificationJob: ReminderNotificationJob,
    private readonly auditScheduler: AuditScheduler,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const enabled =
      await this.settings.getRawValue<boolean>('scheduler.enabled');

    if (enabled === false || String(enabled) === 'false') {
      this.logger.warn(
        'Scheduler is disabled via settings - suspending all jobs',
      );
      this.disableAllJobs();
    } else {
      this.logger.log('Scheduler initialized (Active)');

      // Run the missing-instances audit immediately at startup so that any
      // tasks that were missed while the server was down get flagged right away,
      // without waiting for the first 5-minute cron tick.
      this.logger.log('Running startup audit for missed instances…');
      this.auditScheduler.auditMissedInstances().catch((err) => {
        this.logger.error('Startup audit failed', err);
      });
    }

    this.logger.log('Registered jobs:');
    this.logRegisteredJobs();
  }

  async getJobsStatus(): Promise<
    {
      name: string;
      cron: string;
      enabled: boolean;
      nextRun: Date | null;
      description: string;
    }[]
  > {
    const jobs = this.schedulerRegistry.getCronJobs();
    const result: {
      name: string;
      cron: string;
      enabled: boolean;
      nextRun: Date | null;
      description: string;
    }[] = [];

    const descriptions: Record<string, string> = {
      'cleanup-exports': 'Removes expired export files',
      'cleanup-backups': 'Removes old backups',
      'health-check': 'System health monitoring',
      'audit-producer':
        'Detects past task occurrences with no status and marks them MISSING (runs every 5 min + at startup)',
      'delegation-expiry': 'Notify users about expired delegations',
      'email-alerts': 'Missing task alerts',
      'email-reminders': 'Task due reminders',
      'todo-reminders':
        'Todolist due-date reminders (hourly digest: bell, pop-up, email)',
      'todo-maintenance':
        'Todolist upkeep: removes old notifications of the bell',
      'auto-export': 'Scheduled data export',
      'auto-backup': 'Scheduled system backup',
    };

    const schedulerEnabled =
      await this.settings.getRawValue<boolean>('scheduler.enabled');
    const isGlobalActive =
      schedulerEnabled === true || String(schedulerEnabled) === 'true';

    jobs.forEach((job, name) => {
      let nextRun: Date | null = null;
      try {
        const nextDate = job.nextDate();

        if (typeof nextDate.toJSDate === 'function') {
          nextRun = nextDate.toJSDate();
        } else {
          nextRun = nextDate as unknown as Date;
        }
      } catch {
        // Job might be stopped or invalid
      }

      result.push({
        name,
        cron: String(job.cronTime.source),
        enabled: isGlobalActive && !this.disabledJobs.has(name),
        nextRun,
        description: descriptions[name] || 'System Job',
      });
    });

    return result;
  }

  /**
   * Runs one job now and reports what really happened: success, skipped
   * because the lock is held, or failed with its error.
   */
  async triggerJob(jobName: string): Promise<JobExecutionResult> {
    const runners: Record<string, () => Promise<void | JobExecutionResult>> = {
      'cleanup-exports': () => this.cleanupExportsJob.execute(),
      'cleanup-backups': () => this.cleanupBackupsJob.execute(),
      'health-check': () => this.healthCheckJob.execute(),
      'auto-export': () => this.autoExportJob.execute(),
      'auto-backup': () => this.autoBackupJob.execute(),
      'email-alerts': () => this.missingTasksNotificationJob.execute(),
      'email-reminders': () => this.reminderNotificationJob.execute(),
      'audit-producer': () => this.auditScheduler.auditMissedInstances(),
    };

    let run = runners[jobName];
    if (!run) {
      let job: { fireOnTick?: () => unknown };
      try {
        job = this.schedulerRegistry.getCronJob(jobName) as typeof job;
      } catch {
        return {
          success: false,
          status: 'failed',
          message: `Unknown job: ${jobName}`,
        };
      }
      // Generic fallback for jobs not explicitly mapped above.
      run = async () => {
        await job.fireOnTick?.();
      };
    }

    try {
      const result = await run();
      if (result && typeof result === 'object' && 'status' in result) {
        return result.status === 'success'
          ? { ...result, message: `${jobName} job executed` }
          : result;
      }
      return {
        success: true,
        status: 'success',
        message: `${jobName} job executed`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`[${jobName}] Manual run failed: ${message}`);
      return {
        success: false,
        status: 'failed',
        error: message,
        message: `${jobName} job failed: ${message}`,
      };
    }
  }

  toggleJob(name: string): {
    success: boolean;
    enabled: boolean;
    message: string;
  } {
    try {
      const job = this.schedulerRegistry.getCronJob(name);

      if (!this.disabledJobs.has(name)) {
        job.stop();
        this.disabledJobs.add(name);
        return {
          success: true,
          enabled: false,
          message: `Job ${name} stopped`,
        };
      } else {
        job.start();
        this.disabledJobs.delete(name);
        return { success: true, enabled: true, message: `Job ${name} started` };
      }
    } catch {
      return {
        success: false,
        enabled: false,
        message: `Job ${name} not found`,
      };
    }
  }

  async syncSchedulerState(): Promise<{ enabled: boolean; message: string }> {
    const enabled =
      await this.settings.getRawValue<boolean>('scheduler.enabled');
    this.logger.log(
      `Syncing Scheduler State. Settings Enabled: ${enabled} (${typeof enabled})`,
    );

    if (enabled === true || String(enabled) === 'true') {
      this.restoreAllJobs();
      return { enabled: true, message: 'Scheduler started' };
    } else {
      this.disableAllJobs();
      return { enabled: false, message: 'Scheduler suspended' };
    }
  }

  private restoreAllJobs(): void {
    const jobs = this.schedulerRegistry.getCronJobs();
    this.logger.log(`Restoring ${jobs.size} jobs...`);
    this.disabledJobs.clear();

    jobs.forEach((job, name) => {
      try {
        job.start();
        this.logger.log(`Job '${name}' started.`);
      } catch (e: any) {
        this.logger.error(`Error starting job ${name}: ${e.message}`);
      }
    });
  }

  private disableAllJobs(): void {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((job, name) => {
      job.stop();
      this.disabledJobs.add(name);
      this.logger.log(`Job disabled: ${name}`);
    });
  }

  private logRegisteredJobs(): void {
    const jobs = this.schedulerRegistry.getCronJobs();
    jobs.forEach((_, name) => {
      this.logger.log(`  - ${name}`);
    });
  }

  private isJobRunning(job: any): boolean {
    if (typeof job.running === 'boolean') {
      return job.running;
    }
    return job._isActive === true;
  }
}
