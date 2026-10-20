import { AutoExportJob } from './auto-export.job';

describe('AutoExportJob reports', () => {
  afterEach(() => jest.useRealTimers());

  it('runs the report generator and records every generated format', async () => {
    jest.useFakeTimers();
    const now = new Date(2026, 9, 20, 0, 0);
    jest.setSystemTime(now);
    const paths = ['exports/export_report.csv', 'exports/export_report.pdf'];
    const reports = { generate: jest.fn().mockResolvedValue(paths) };
    const settings = {
      getRawValue: jest.fn(async (key: string) =>
        key === 'export.autoExport.enabled' ? true : undefined,
      ),
    };
    const audit = { log: jest.fn() };
    const job = new AutoExportJob(
      reports as never,
      settings as never,
      audit as never,
      {} as never,
      {} as never,
    );

    await job.execute();

    expect(reports.generate).toHaveBeenCalledWith(now);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        details: expect.objectContaining({ paths }),
      }),
    );
  });
});
