import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { LocalNetworkGuard } from '../common/guards/local-network.guard';
import { Response } from 'express';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockGuardCanActivate: jest.Mock;

  beforeEach(async () => {
    mockGuardCanActivate = jest.fn().mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: 'PROMETHEUS_REGISTRY',
          useValue: { metrics: jest.fn().mockResolvedValue('metrics_data') },
        },
      ],
    })
      .overrideGuard(LocalNetworkGuard)
      .useValue({ canActivate: mockGuardCanActivate })
      .compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics when LocalNetworkGuard allows', async () => {
    mockGuardCanActivate.mockReturnValue(true);

    const mockReponse = {
      header: jest.fn(),
      send: jest.fn(),
    } as unknown as Response;

    // Metrics returning Prometheus format string
    await expect(controller.index(mockReponse)).resolves.not.toThrow();
  });
});
