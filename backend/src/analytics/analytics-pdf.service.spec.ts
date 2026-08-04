import { Test, TestingModule } from '@nestjs/testing';
import { InternalServerErrorException } from '@nestjs/common';
import * as fs from 'fs';
import { AnalyticsPdfService } from './analytics-pdf.service';
import { AnalyticsService } from './analytics.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
}));

describe('AnalyticsPdfService', () => {
  let service: AnalyticsPdfService;
  let originalPlatform: PropertyDescriptor | undefined;
  const existsSyncMock = fs.existsSync as jest.Mock;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsPdfService,
        {
          provide: AnalyticsService,
          useValue: { getOverview: jest.fn(), getByTask: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AnalyticsPdfService>(AnalyticsPdfService);
    originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    existsSyncMock.mockReset().mockReturnValue(false);
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
  });

  afterEach(() => {
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
  });

  function setPlatform(platform: string) {
    Object.defineProperty(process, 'platform', { value: platform });
  }

  describe('resolveExecutablePath', () => {
    it('prefers PUPPETEER_EXECUTABLE_PATH when it exists', () => {
      process.env.PUPPETEER_EXECUTABLE_PATH = '/custom/browser';
      existsSyncMock.mockImplementation(
        (p: fs.PathLike) => p === '/custom/browser',
      );

      expect((service as any).resolveExecutablePath()).toBe('/custom/browser');
    });

    it('detects Microsoft Edge on Windows when present', () => {
      setPlatform('win32');
      existsSyncMock.mockImplementation(
        (p: fs.PathLike) =>
          p ===
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      );

      expect((service as any).resolveExecutablePath()).toBe(
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      );
    });

    it('throws a clear, actionable error on Windows when Edge is absent (no bundled Chromium)', () => {
      setPlatform('win32');
      existsSyncMock.mockReturnValue(false);

      expect(() => (service as any).resolveExecutablePath()).toThrow(
        InternalServerErrorException,
      );
      expect(() => (service as any).resolveExecutablePath()).toThrow(
        /Microsoft Edge|PUPPETEER_EXECUTABLE_PATH/,
      );
    });

    it('falls back to the Linux chromium-browser path when present', () => {
      setPlatform('linux');
      existsSyncMock.mockImplementation(
        (p: fs.PathLike) => p === '/usr/bin/chromium-browser',
      );

      expect((service as any).resolveExecutablePath()).toBe(
        '/usr/bin/chromium-browser',
      );
    });

    it('returns undefined on Linux when no known browser is found (Puppeteer bundled fallback)', () => {
      setPlatform('linux');
      existsSyncMock.mockReturnValue(false);

      expect((service as any).resolveExecutablePath()).toBeUndefined();
    });
  });

  describe('buildHtml', () => {
    it('never references an external Google Fonts import', () => {
      const html = (service as any).buildHtml({
        overview: {
          success: 8,
          failed: 1,
          running: 0,
          missing: 0,
          total: 9,
          complianceRate: 88.8,
        },
        tasks: [],
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      });

      expect(html).not.toContain('fonts.googleapis.com');
      expect(html).not.toContain('@import url(');
    });
  });
});
