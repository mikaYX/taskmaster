/**
 * Scheduler Job Interface.
 *
 * All scheduled jobs must implement this interface.
 */
export interface SchedulerJob {
  /**
   * Job name for identification.
   */
  readonly name: string;

  /**
   * Cron expression.
   */
  readonly cron: string;

  /**
   * Execute the job.
   */
  execute(): Promise<void>;
}

export const SCHEDULER_JOB = Symbol('SCHEDULER_JOB');
