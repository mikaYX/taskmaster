import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { SettingsService } from '../settings';
import { JOB_DEFINITIONS } from './job-definitions';
import { JobRunner } from './job-runner.service';
import { isSchedulerEnabled } from './scheduler-enabled';

@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly schedulerRegistry: SchedulerRegistry,
    private readonly settings: SettingsService,
    private readonly runner: JobRunner,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!(await isSchedulerEnabled(this.settings))) {
      this.logger.warn(
        'Scheduler is disabled via settings - suspending all jobs',
      );
      this.disableAllJobs();
    } else {
      this.logger.log('Scheduler initialized (Active)');
      // The startup audit shares the cron lock, including across instances.
      void this.runner
        .run(JOB_DEFINITIONS['audit-producer'].name, 'cron')
        .catch((error: unknown) => {
          this.logger.error('Startup audit failed', error);
        });
    }
    this.schedulerRegistry.getCronJobs().forEach((_, name) => {
      this.logger.log(`Registered job: ${name}`);
    });
  }

  async getJobsStatus() {
    const enabled = await isSchedulerEnabled(this.settings);
    return Array.from(this.schedulerRegistry.getCronJobs(), ([name, job]) => {
      const definition = Object.values(JOB_DEFINITIONS).find(
        (entry) => entry.name === name,
      );
      if (!definition) throw new Error(`Missing job definition: ${name}`);
      let nextRun: Date | null = null;
      try {
        nextRun = job.nextDate().toJSDate();
      } catch {
        // Job might be stopped or invalid.
      }
      return {
        name,
        cron: definition.cron,
        description: definition.description,
        enabled: enabled && !this.runner.isPaused(name),
        nextRun,
        lastRun: this.runner.getLastRun(name),
      };
    });
  }

  triggerJob(name: string) {
    return this.runner.run(name, 'manual');
  }

  toggleJob(name: string): {
    success: boolean;
    enabled: boolean;
    message: string;
  } {
    try {
      const job = this.schedulerRegistry.getCronJob(name);
      const enabled = this.runner.isPaused(name);
      if (enabled) job.start();
      else job.stop();
      this.runner.setPaused(name, !enabled);
      return {
        success: true,
        enabled,
        message: `Job ${name} ${enabled ? 'started' : 'stopped'}`,
      };
    } catch {
      return {
        success: false,
        enabled: false,
        message: `Job ${name} not found`,
      };
    }
  }

  async syncSchedulerState(): Promise<{ enabled: boolean; message: string }> {
    const enabled = await isSchedulerEnabled(this.settings);
    if (enabled) {
      this.schedulerRegistry.getCronJobs().forEach((job, name) => {
        // Global resume retains the existing behavior: individual pauses reset.
        this.runner.setPaused(name, false);
        try {
          job.start();
        } catch (error) {
          this.logger.error(`Error starting job ${name}`, error);
        }
      });
    } else {
      this.disableAllJobs();
    }
    return {
      enabled,
      message: enabled ? 'Scheduler started' : 'Scheduler suspended',
    };
  }

  private disableAllJobs(): void {
    this.schedulerRegistry.getCronJobs().forEach((job, name) => {
      job.stop();
      this.runner.setPaused(name, true);
    });
  }
}
