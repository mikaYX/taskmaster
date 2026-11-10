import { Test } from '@nestjs/testing';
import { SettingsService } from '../../settings';
import { ReportExportService } from '../../backup/report-export.service';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JobRunner } from '../job-runner.service';
import { AutoExportJob } from './auto-export.job';

describe('AutoExportJob reports', () => {
  afterEach(() => jest.useRealTimers());

  it.each([true, undefined, null])(
    'runs the report generator with enabled=%s (default on)',
    async (enabled) => {
      jest.useFakeTimers();
      const now = new Date(2026, 9, 20, 0, 0);
      jest.setSystemTime(now);
      const paths = ['exports/export_report.csv', 'exports/export_report.pdf'];
      const reports = { generate: jest.fn().mockResolvedValue(paths) };
      const settings = {
        getRawValue: jest.fn(async (key: string) =>
          key === 'export.autoExport.enabled' ? enabled : undefined,
        ),
      };
      const audit = { log: jest.fn() };
      const job = new AutoExportJob(
        reports as never,
        settings as never,
        audit as never,
        {} as never,
        {} as never,
        { register: jest.fn() } as never,
      );

      await job.execute();

      expect(reports.generate).toHaveBeenCalledWith(now);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ paths }),
        }),
      );
    },
  );
});

describe('AutoExportJob recipient settings', () => {
  it('resolves string IDs and the admin selector without sending strings to Prisma IDs', async () => {
    const values: Record<string, unknown> = {
      'export.autoExport.enabled': true,
      'export.autoExport.email.enabled': true,
      'export.autoExport.email.recipients': [
        'admin',
        'Admin',
        '42',
        'Custom',
        'invalid',
        '-1',
      ],
      'export.autoExport.email.customEmails': ['custom@example.com'],
    };
    const findMany = jest
      .fn()
      .mockResolvedValue([{ email: 'admin@example.com' }]);
    const send = jest.fn();
    const module = await Test.createTestingModule({
      providers: [
        AutoExportJob,
        {
          provide: SettingsService,
          useValue: { getRawValue: async (key: string) => values[key] },
        },
        {
          provide: ReportExportService,
          useValue: { generate: jest.fn().mockResolvedValue([]) },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: EmailService, useValue: { send } },
        {
          provide: PrismaService,
          useValue: { client: { user: { findMany } } },
        },
        { provide: JobRunner, useValue: { register: jest.fn() } },
      ],
    }).compile();
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 0, 0));
    try {
      await module.get(AutoExportJob).execute();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ id: { in: [42] } }, { role: 'SUPER_ADMIN' }],
          }),
        }),
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: expect.arrayContaining([
            'custom@example.com',
            'admin@example.com',
          ]),
        }),
      );
    } finally {
      jest.useRealTimers();
      await module.close();
    }
  });
});
