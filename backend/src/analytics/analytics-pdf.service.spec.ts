import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsPdfService } from './analytics-pdf.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsPdfService', () => {
  let service: AnalyticsPdfService;
  const analytics = { getOverview: jest.fn(), getByTask: jest.fn() };

  const overview = {
    success: 8,
    failed: 1,
    running: 0,
    missing: 2,
    total: 11,
    complianceRate: 88.8,
  };

  beforeEach(async () => {
    analytics.getOverview.mockReset().mockResolvedValue(overview);
    analytics.getByTask.mockReset().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsPdfService,
        { provide: AnalyticsService, useValue: analytics },
      ],
    }).compile();

    service = module.get<AnalyticsPdfService>(AnalyticsPdfService);
  });

  it('returns a PDF document without needing a browser', async () => {
    const buffer = await service.generate('2026-01-01', '2026-01-31');

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.subarray(-6).toString()).toContain('%%EOF');
    expect(analytics.getOverview).toHaveBeenCalledWith(
      '2026-01-01',
      '2026-01-31',
    );
  });

  it('renders an empty period', async () => {
    const buffer = await service.generate('2026-01-01', '2026-01-31');

    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('paginates long task lists and survives unsupported characters', async () => {
    const tasks = Array.from({ length: 120 }, (_, i) => ({
      taskId: i,
      taskName: `Contrôle n°${i} – ${'très long nom '.repeat(8)} 日本語 😀`,
      total: 10,
      failed: i % 3,
      complianceRate: 100 - (i % 40),
    }));
    analytics.getByTask.mockResolvedValue(tasks);

    const buffer = await service.generate('2026-01-01', '2026-01-31');
    const pages = buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? [];

    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages.length).toBeGreaterThan(1);
  });

  it('embeds a Unicode font so Cyrillic and Greek names are kept', async () => {
    analytics.getByTask.mockResolvedValue([
      {
        taskId: 1,
        taskName: 'Проверка резервных копий – Έλεγχος αντιγράφων',
        total: 4,
        failed: 0,
        complianceRate: 100,
      },
    ]);

    const buffer = await service.generate('2026-01-01', '2026-01-31');

    expect(buffer.toString('latin1')).toContain('DejaVuSans');
  });

  it('replaces characters the built-in font cannot draw', () => {
    const safe = (service as any).safe('Café – 日本 😀 12');

    expect(safe).toBe('Café – ?? ? 12');
  });
});
