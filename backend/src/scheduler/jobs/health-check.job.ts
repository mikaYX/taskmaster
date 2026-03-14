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
@Injectable()
export class HealthCheckJob implements SchedulerJob {
  readonly name = 'health-check';
  readonly cron = '*/5 * * * *'; // Every 5 minutes

  private readonly logger = new Logger(HealthCheckJob.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('*/5 * * * *', { name: 'health-check' })
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
    }
  }
}
