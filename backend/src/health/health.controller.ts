import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  MemoryHealthIndicator,
} from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';

import { ConfigService } from '@nestjs/config';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealth: PrismaHealthIndicator,
    private redisHealth: RedisHealthIndicator,
    private memory: MemoryHealthIndicator,
    private config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      // Database Check
      () => this.prismaHealth.isHealthy('database'),

      // Redis Check
      () => this.redisHealth.isHealthy('redis'),

      // Memory Check (512MB default, configurable via MEMORY_HEAP_THRESHOLD)
      () =>
        this.memory.checkHeap(
          'memory_heap',
          this.config.get<number>('MEMORY_HEAP_THRESHOLD', 512 * 1024 * 1024),
        ),
    ]);
  }
}
