import { Injectable, Inject } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    super();
  }

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    try {
      await this.redis.ping();
      return {
        [key]: {
          status: 'up',
        },
      };
    } catch (error) {
      // Return "down" instead of throwing so the health endpoint returns 200
      // with details (client can still see redis is down).
      return this.getStatus(key, false, {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
