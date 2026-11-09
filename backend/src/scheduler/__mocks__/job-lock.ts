import type { JobExecutionResult } from '../scheduler.interface';

/** In-memory substitute: no Redis connection, real exclusion while work awaits. */
export class MemoryJobLock {
  readonly held = new Set<string>();
  readonly calls: { name: string; ttl: number }[] = [];
  error?: Error;

  async withLock(
    name: string,
    work: () => Promise<void> | void,
    ttl: number,
  ): Promise<JobExecutionResult> {
    this.calls.push({ name, ttl });
    if (this.error) throw this.error;
    if (this.held.has(name))
      return {
        success: false,
        status: 'locked',
        message: 'Job is already running',
      };
    this.held.add(name);
    try {
      await work();
      return {
        success: true,
        status: 'success',
        message: 'Job executed successfully',
      };
    } finally {
      this.held.delete(name);
    }
  }
}
