import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthCheckService, MemoryHealthIndicator } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { RedisHealthIndicator } from './redis.health';
import { ConfigService } from '@nestjs/config';
import { LocalNetworkGuard } from '../common/guards/local-network.guard';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('HealthController', () => {
  let controller: HealthController;
  let mockGuardCanActivate: jest.Mock;

  beforeEach(async () => {
    // Mock the guard to simulate access control
    mockGuardCanActivate = jest.fn().mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: {
            check: jest
              .fn()
              .mockImplementation((checks) =>
                Promise.all(checks.map((c: any) => c())),
              ),
          },
        },
        { provide: PrismaHealthIndicator, useValue: { isHealthy: jest.fn() } },
        { provide: RedisHealthIndicator, useValue: { isHealthy: jest.fn() } },
        { provide: MemoryHealthIndicator, useValue: { checkHeap: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: Reflector, useValue: {} },
      ],
    })
      .overrideGuard(LocalNetworkGuard)
      .useValue({ canActivate: mockGuardCanActivate })
      .compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return health check results when LocalNetworkGuard allows', async () => {
    mockGuardCanActivate.mockReturnValue(true);
    await expect(controller.check()).resolves.toBeDefined();
  });
});
