import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { AnalyticsService } from '../analytics/analytics.service';
import { AnalyticsPdfService } from '../analytics/analytics-pdf.service';
import { SettingsService } from '../settings';
import { ExportService } from './export.service';

@Injectable()
export class ReportExportService {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly pdf: AnalyticsPdfService,
    private readonly settings: SettingsService,
    private readonly exports: ExportService,
  ) {}

  async generate(now = new Date()): Promise<string[]> {
    const formats = (await this.settings.getRawValue<string[]>(
      'export.autoExport.formats',
    )) ?? ['csv'];
    if (
      !Array.isArray(formats) ||
      formats.length === 0 ||
      formats.some((f) => f !== 'csv' && f !== 'pdf')
    ) {
      throw new BadRequestException(
        'Select at least one export format: CSV or PDF',
      );
    }
    const from =
      (await this.settings.getRawValue<number>('export.offset.from')) ?? 30;
    const to =
      (await this.settings.getRawValue<number>('export.offset.to')) ?? 0;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < to) {
      throw new BadRequestException('Invalid export period');
    }
    const start = new Date(now);
    start.setDate(start.getDate() - from);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setDate(end.getDate() - to);
    end.setHours(23, 59, 59, 999);
    const startDate = start.toISOString();
    const endDate = end.toISOString();
    const dir = await this.exports.resolveExportDir();
    await mkdir(dir, { recursive: true });
    const prefix = `export_${now.toISOString().replace(/[:.]/g, '-')}_${randomUUID()}_analytics`;
    const paths: string[] = [];
    for (const format of new Set(formats)) {
      const buffer =
        format === 'pdf'
          ? await this.pdf.generate(startDate, endDate)
          : await this.analytics.generateCsv(startDate, endDate);
      const path = join(dir, `${prefix}.${format}`);
      await writeFile(path, buffer);
      paths.push(path);
    }
    return paths;
  }
}
