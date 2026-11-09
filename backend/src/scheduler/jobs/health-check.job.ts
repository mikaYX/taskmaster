import { JobRunner } from '../job-runner.service';
import { JOB_DEFINITIONS } from '../job-definitions';
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { SchedulerJob } from '../scheduler.interface';
import { PrismaService } from '../../prisma';

/**
 * Health Check Job.
 *
 * Validates database connection and logs status.
 * Runs every 5 minutes.
 */
const DEF = JOB_DEFINITIONS['health-check'];

@Injectable()
export class HealthCheckJob implements SchedulerJob {
  readonly name = DEF.name;
  readonly cron = DEF.cron; // Every 5 minutes

  private readonly logger = new Logger(HealthCheckJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: JobRunner,
  ) {
    this.runner.register(DEF, () => this.execute());
  }

  @Cron(DEF.cron, { name: DEF.name })
  handleCron() {
    return this.runner.run(DEF.name, 'cron');
  }

  async execute(): Promise<void> {
    const start = Date.now();

    try {
      // Simple query to check database connection
      await this.prisma.client.$queryRaw`SELECT 1`;
      const duration = Date.now() - start;
      this.logger.debug(`[${this.name}] Database OK (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - start;
      this.logger.error(
        `[${this.name}] Database check failed after ${duration}ms`,
        error,
      );
      throw error;
    }
  }
}
