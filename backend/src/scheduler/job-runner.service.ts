import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { JobLockService } from './job-lock.service';
import type { JobDefinition } from './job-definitions';
import type { JobExecutionResult } from './scheduler.interface';
import { isSchedulerEnabled } from './scheduler-enabled';

export type JobRun = JobExecutionResult & {
  durationMs: number;
  finishedAt: string;
};

@Injectable()
export class JobRunner {
  private readonly logger = new Logger(JobRunner.name);
  private readonly jobs = new Map<
    string,
    { definition: JobDefinition; handler: () => Promise<void> }
  >();
  private readonly lastRuns = new Map<string, JobRun>();
  private readonly paused = new Set<string>();

  constructor(
    private readonly lock: JobLockService,
    private readonly settings: SettingsService,
  ) {}

  register(definition: JobDefinition, handler: () => Promise<void>): void {
    if (this.jobs.has(definition.name))
      throw new Error(`Duplicate job: ${definition.name}`);
    this.jobs.set(definition.name, { definition, handler });
  }

  getLastRun(name: string): JobRun | undefined {
    const result = this.lastRuns.get(name);
    return result ? { ...result } : undefined;
  }

  isPaused(name: string): boolean {
    return this.paused.has(name);
  }
  setPaused(name: string, paused: boolean): void {
    if (paused) this.paused.add(name);
    else this.paused.delete(name);
  }

  async run(name: string, trigger: 'cron' | 'manual'): Promise<JobRun> {
    const start = Date.now();
    let result: JobExecutionResult;
    const job = this.jobs.get(name);
    try {
      if (!job) {
        result = {
          success: false,
          status: 'failed',
          message: `Unknown job: ${name}`,
        };
      } else if (
        trigger === 'cron' &&
        (this.isPaused(name) || !(await isSchedulerEnabled(this.settings)))
      ) {
        // A suspended tick is not an execution and must not erase the last run.
        return {
          success: false,
          status: 'skipped',
          message: 'Scheduler or job is paused',
          durationMs: Date.now() - start,
          finishedAt: new Date().toISOString(),
        };
      } else {
        result = await this.lock.withLock(
          name,
          job.handler,
          job.definition.lockTtlSeconds,
        );
        if (result.status === 'success')
          result = { ...result, message: `${name} job executed` };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result = {
        success: false,
        status: 'failed',
        error: message,
        message: `${name} job failed: ${message}`,
      };
    }
    if (result.status === 'failed')
      this.logger.error(`[${name}] ${trigger}: ${result.message}`);
    const run = {
      ...result,
      durationMs: Date.now() - start,
      finishedAt: new Date().toISOString(),
    };
    if (job) this.lastRuns.set(name, run);
    return { ...run };
  }
}
