import { mkdir, writeFile } from 'fs/promises';
import { ReportExportService } from './report-export.service';

jest.mock('fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));

describe('ReportExportService', () => {
  const csv = Buffer.from('\uFEFFTâche,Total\nRonde,1');
  const pdf = Buffer.from('%PDF-1.7');
  const analytics = { generateCsv: jest.fn() };
  const pdfService = { generate: jest.fn() };
  const settings = { getRawValue: jest.fn() };
  const exports = { resolveExportDir: jest.fn() };
  const service = new ReportExportService(
    analytics as never,
    pdfService as never,
    settings as never,
    exports as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    analytics.generateCsv.mockResolvedValue(csv);
    pdfService.generate.mockResolvedValue(pdf);
    exports.resolveExportDir.mockResolvedValue('exports');
    settings.getRawValue.mockImplementation(
      async (key: string) =>
        ({
          'export.autoExport.formats': ['csv', 'pdf'],
          'export.offset.from': 7,
          'export.offset.to': 0,
        })[key],
    );
  });

  it('writes separate CSV and PDF reports for the configured period', async () => {
    const now = new Date(2026, 9, 20, 12);
    const paths = await service.generate(now);
    const start = new Date(2026, 9, 13, 0, 0, 0, 0).toISOString();
    const end = new Date(2026, 9, 20, 23, 59, 59, 999).toISOString();
    expect(analytics.generateCsv).toHaveBeenCalledWith(start, end);
    expect(pdfService.generate).toHaveBeenCalledWith(start, end);
    expect(paths).toHaveLength(2);
    expect(paths[0]).toMatch(/export_.*_analytics\.csv$/);
    expect(paths[1]).toMatch(/export_.*_analytics\.pdf$/);
    expect(writeFile).toHaveBeenCalledWith(paths[0], csv);
    expect(writeFile).toHaveBeenCalledWith(paths[1], pdf);
  });

  it('generates only PDF when CSV is not selected', async () => {
    settings.getRawValue.mockImplementation(async (key: string) =>
      key === 'export.autoExport.formats' ? ['pdf'] : undefined,
    );
    const paths = await service.generate();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toMatch(/\.pdf$/);
    expect(analytics.generateCsv).not.toHaveBeenCalled();
  });

  it('rejects unsupported formats instead of silently generating JSON', async () => {
    settings.getRawValue.mockResolvedValue(['json']);
    await expect(service.generate()).rejects.toThrow('CSV or PDF');
    expect(mkdir).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('propagates PDF generation failures', async () => {
    pdfService.generate.mockRejectedValue(new Error('Browser unavailable'));
    await expect(service.generate()).rejects.toThrow('Browser unavailable');
  });
});
