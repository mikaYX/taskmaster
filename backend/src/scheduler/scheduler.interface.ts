/** What a job run really did: it ran, it was skipped by the lock, or it failed. */
export interface JobExecutionResult {
  success: boolean;
  status: 'success' | 'locked' | 'failed';
  message: string;
  error?: string;
}

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
  execute(): Promise<void | JobExecutionResult>;
}

export const SCHEDULER_JOB = Symbol('SCHEDULER_JOB');
