/** Outcome of an execution attempt, including locked or paused ticks. */
export interface JobExecutionResult {
  success: boolean;
  status: 'success' | 'locked' | 'failed' | 'skipped';
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
  execute(): Promise<void>;
}

export const SCHEDULER_JOB = Symbol('SCHEDULER_JOB');
