import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPdfService } from './analytics-pdf.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsPdfService],
})
export class AnalyticsModule {}
