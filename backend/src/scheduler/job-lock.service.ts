import { Injectable, Inject, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

@Injectable()
export class JobLockService {
  private readonly logger = new Logger(JobLockService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Acquire a lock for a job execution to prevent overlaps.
   * Lock expires automatically after ttlSeconds.
   */
  async acquireLock(
    jobName: string,
    ttlSeconds: number = 300,
  ): Promise<boolean> {
    const key = `scheduler:lock:${jobName}`;
    const result = await this.redis.set(key, 'LOCKED', 'EX', ttlSeconds, 'NX');
    return result === 'OK';
  }

  /**
   * Release the lock for a job.
   */
  async releaseLock(jobName: string): Promise<void> {
    const key = `scheduler:lock:${jobName}`;
    await this.redis.del(key);
  }

  /**
   * Wrap job execution with a distributed lock and idempotence mechanism.
   */
  async withLock(
    jobName: string,
    executeFn: () => Promise<void> | void,
    ttlSeconds: number = 300,
  ): Promise<{ success: boolean; message: string }> {
    const locked = await this.acquireLock(jobName, ttlSeconds);
    if (!locked) {
      this.logger.warn(
        `[${jobName}] Execution skipped: Job is already running (locked)`,
      );
      return { success: false, message: 'Job is already running' };
    }

    try {
      this.logger.log(`[${jobName}] Lock acquired. Starting execution...`);
      await executeFn();
      return { success: true, message: 'Job executed successfully' };
    } catch (err: any) {
      this.logger.error(
        `[${jobName}] Execution failed: ${err.message}`,
        err.stack,
      );
      return { success: false, message: `Execution failed: ${err.message}` };
    } finally {
      await this.releaseLock(jobName);
      this.logger.log(`[${jobName}] Lock released.`);
    }
  }
}
