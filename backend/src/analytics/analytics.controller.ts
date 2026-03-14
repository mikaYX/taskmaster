import {
  Controller,
  Get,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  StreamableFile,
  Header,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPdfService } from './analytics-pdf.service';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth';
import { DateRangeDto, TrendQueryDto, ByTaskQueryDto } from './dto';
import type {
  OverviewResponse,
  TrendPoint,
  TaskComplianceItem,
  UserComplianceItem,
} from './dto';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly pdfService: AnalyticsPdfService,
  ) {}

  @Get('overview')
  async getOverview(@Query() query: DateRangeDto): Promise<OverviewResponse> {
    return this.analyticsService.getOverview(query.startDate, query.endDate);
  }

  @Get('trend')
  async getTrend(@Query() query: TrendQueryDto): Promise<TrendPoint[]> {
    return this.analyticsService.getTrend(
      query.startDate,
      query.endDate,
      query.groupBy,
    );
  }

  @Get('by-task')
  async getByTask(
    @Query() query: ByTaskQueryDto,
  ): Promise<TaskComplianceItem[]> {
    return this.analyticsService.getByTask(
      query.startDate,
      query.endDate,
      query.limit,
    );
  }

  @Get('by-user')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'SUPER_ADMIN', 'GUEST')
  async getByUser(@Query() query: DateRangeDto): Promise<UserComplianceItem[]> {
    return this.analyticsService.getByUser(query.startDate, query.endDate);
  }

  // ── Export CSV ──────────────────────────────────────────

  @Get('export/csv')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'SUPER_ADMIN', 'GUEST')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() query: DateRangeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filename = `analytics_${query.startDate}_${query.endDate}.csv`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    const tasks = await this.analyticsService.getByTask(
      query.startDate,
      query.endDate,
      9999,
    );

    const BOM = '\uFEFF';
    const header = 'Tâche,Total,Succès,Échecs,Manquants,Conformité (%)';
    const rows = tasks.map((t) => {
      const name = `"${t.taskName.replace(/"/g, '""')}"`;
      return `${name},${t.total},${t.success},${t.failed},${t.missing},${t.complianceRate.toFixed(1)}`;
    });

    const csv = BOM + [header, ...rows].join('\n');
    return new StreamableFile(Buffer.from(csv, 'utf-8'));
  }

  // ── Export PDF ──────────────────────────────────────────

  @Get('export/pdf')
  @UseGuards(RolesGuard)
  @Roles('MANAGER', 'SUPER_ADMIN', 'GUEST')
  @Header('Content-Type', 'application/pdf')
  async exportPdf(
    @Query() query: DateRangeDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const filename = `rapport_analytics_${query.startDate}_${query.endDate}.pdf`;
    res.set('Content-Disposition', `attachment; filename="${filename}"`);

    const buffer = await this.pdfService.generate(
      query.startDate,
      query.endDate,
    );
    return new StreamableFile(buffer);
  }
}
