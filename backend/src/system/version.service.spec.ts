import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { VersionService } from './version.service';
import { safeFetch } from '../common/utils/url-validator.util';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
}));

jest.mock('../common/utils/url-validator.util', () => ({
  safeFetch: jest.fn(),
}));

const mockedReadFileSync = fs.readFileSync as jest.Mock;

function mockFetch(impl: (...args: unknown[]) => Promise<unknown>) {
  (safeFetch as jest.Mock).mockImplementation(impl);
}

function makeRelease(tagName: string, prerelease = false) {
  return {
    ok: true,
    json: async () => ({
      tag_name: tagName,
      html_url: `https://github.com/mikaYX/taskmaster/releases/tag/${tagName}`,
      prerelease,
    }),
  };
}

describe('VersionService', () => {
  let service: VersionService;
  let configGet: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockedReadFileSync.mockReturnValue(JSON.stringify({ version: '1.0.0' }));

    configGet = jest.fn().mockReturnValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VersionService,
        { provide: ConfigService, useValue: { get: configGet } },
      ],
    }).compile();

    service = module.get<VersionService>(VersionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveCurrentVersion', () => {
    it('should read version from package.json', () => {
      expect(service.getCurrentVersion()).toBe('1.0.0');
    });

    it('should fallback to process.env.npm_package_version', async () => {
      mockedReadFileSync.mockImplementation(() => {
        throw new Error('ENOENT');
      });
      const originalEnv = process.env.npm_package_version;
      process.env.npm_package_version = '2.5.0';

      const freshModule = await Test.createTestingModule({
        providers: [
          VersionService,
          { provide: ConfigService, useValue: { get: configGet } },
        ],
      }).compile();
      const freshService = freshModule.get<VersionService>(VersionService);

      expect(freshService.getCurrentVersion()).toBe('2.5.0');
      process.env.npm_package_version = originalEnv;
    });
  });

  describe('getVersionStatus', () => {
    it('should return version info when GitHub release exists', async () => {
      mockFetch(async () => makeRelease('v1.2.0'));

      const result = await service.getVersionStatus();

      expect(result.currentVersion).toBe('1.0.0');
      expect(result.latestVersion).toBe('1.2.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.repo).toBe('mikaYX/taskmaster');
      expect(result.releaseUrl).toContain('github.com');
      expect(result.sourceStatus).toBe('ok');
      expect(result.error).toBeNull();
      expect(result.checkedAt).toBeTruthy();
    });

    it('should handle version tags without v prefix', async () => {
      mockFetch(async () => makeRelease('2.0.0'));

      const result = await service.getVersionStatus();

      expect(result.latestVersion).toBe('2.0.0');
      expect(result.updateAvailable).toBe(true);
    });

    it('should report no update when versions are equal', async () => {
      mockFetch(async () => makeRelease('v1.0.0'));

      const result = await service.getVersionStatus();

      expect(result.updateAvailable).toBe(false);
    });

    it('should report no update when current is newer', async () => {
      mockFetch(async () => makeRelease('v0.9.0'));

      const result = await service.getVersionStatus();

      expect(result.updateAvailable).toBe(false);
    });

    it('should ignore prerelease versions', async () => {
      mockFetch(async () => makeRelease('v2.0.0-beta.1'));

      const result = await service.getVersionStatus();

      expect(result.updateAvailable).toBe(false);
    });

    it('should fallback to package.json when no releases exist', async () => {
      let callCount = 0;
      mockFetch(async () => {
        callCount++;
        if (callCount === 1) {
          return { ok: false, status: 404 };
        }
        return {
          ok: true,
          json: async () => ({ version: '1.5.0' }),
        };
      });

      const result = await service.getVersionStatus();

      expect(result.latestVersion).toBe('1.5.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBeNull();
    });

    it('should return degraded status on complete GitHub failure', async () => {
      mockFetch(async () => {
        throw new Error('Network error');
      });

      const result = await service.getVersionStatus();

      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBe('Unable to check for updates');
      expect(result.updateAvailable).toBe(false);
      expect(result.currentVersion).toBe('1.0.0');
    });

    it('should use cached result within TTL', async () => {
      mockFetch(async () => makeRelease('v1.2.0'));

      const first = await service.getVersionStatus();
      const second = await service.getVersionStatus();

      expect(first).toBe(second);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    });

    it('should use VERSION_CHECK_REPO when configured', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'VERSION_CHECK_REPO' ? 'custom-org/custom-repo' : undefined,
      );
      mockFetch(async () => makeRelease('v1.0.0'));

      const result = await service.getVersionStatus();

      expect(result.repo).toBe('custom-org/custom-repo');
      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining('custom-org/custom-repo'),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should handle GitHub timeout gracefully', async () => {
      mockFetch(async () => {
        const error = new DOMException('The operation was aborted', 'AbortError');
        throw error;
      });

      const result = await service.getVersionStatus();

      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBe('Unable to check for updates');
    });

    it('should deduplicate concurrent requests', async () => {
      let resolvePromise: (v: unknown) => void;
      mockFetch(
        () =>
          new Promise((resolve) => {
            resolvePromise = resolve;
          }),
      );

      const p1 = service.getVersionStatus();
      const p2 = service.getVersionStatus();

      resolvePromise!(makeRelease('v1.2.0'));

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe(r2);
      expect(safeFetch).toHaveBeenCalledTimes(1);
    });
  });
});
