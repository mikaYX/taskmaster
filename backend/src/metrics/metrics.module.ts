import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics', // We will remap this in main.ts or Controller if needed
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  controllers: [MetricsController],
})
export class MetricsModule {}
