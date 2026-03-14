import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key = 'database'): Promise<HealthIndicatorResult> {
    try {
      // PrismaService wraps PrismaClient, so access .client
      // If types are strict, casting might be needed but .client is public getter
      await this.prisma.client.$queryRaw`SELECT 1`;

      return {
        [key]: {
          status: 'up',
        },
      };
    } catch (error) {
      throw new HealthCheckError('Prisma check failed', {
        [key]: {
          status: 'down',
          message: error.message,
        },
      });
    }
  }
}
