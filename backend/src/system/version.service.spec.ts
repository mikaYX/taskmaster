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

function makeDockerTags(tagNames: string[], count = tagNames.length) {
  return {
    ok: true,
    json: async () => ({
      count,
      results: tagNames.map((name) => ({ name })),
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

    it('should refresh version status when explicitly requested', async () => {
      mockFetch(async () => makeRelease('v1.2.0'));

      const first = await service.getVersionStatus();

      mockFetch(async () => makeRelease('v1.3.0'));

      const refreshed = await service.refreshVersionStatus();

      expect(first.latestVersion).toBe('1.2.0');
      expect(refreshed.latestVersion).toBe('1.3.0');
      expect(safeFetch).toHaveBeenCalledTimes(2);
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
        const error = new DOMException(
          'The operation was aborted',
          'AbortError',
        );
        throw error;
      });

      const result = await service.getVersionStatus();

      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBe('Unable to check for updates');
    });

    it('should use Docker Hub tags when TASKMASTER_IMAGE targets Docker Hub', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'TASKMASTER_IMAGE' ? 'mikaxy/taskmaster:latest' : undefined,
      );
      mockFetch(async () => makeDockerTags(['latest', '1.0.0', '1.2.0']));

      const result = await service.getVersionStatus();

      expect(result.latestVersion).toBe('1.2.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.repo).toBe('mikaxy/taskmaster');
      expect(result.releaseUrl).toBe(
        'https://hub.docker.com/r/mikaxy/taskmaster/tags?name=1.2.0',
      );
      expect(result.sourceStatus).toBe('ok');
      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v2/namespaces/mikaxy/repositories/taskmaster/tags?page=1&page_size=100',
        ),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should use VERSION_CHECK_DOCKER_IMAGE when configured for Docker deployments', async () => {
      configGet.mockImplementation((key: string) => {
        if (key === 'TASKMASTER_IMAGE') return 'mikaxy/taskmaster:latest';
        if (key === 'VERSION_CHECK_DOCKER_IMAGE') {
          return 'fork-user/taskmaster-fork:stable';
        }
        return undefined;
      });
      mockFetch(async () => makeDockerTags(['0.9.0', '1.3.0']));

      const result = await service.getVersionStatus();

      expect(result.latestVersion).toBe('1.3.0');
      expect(result.repo).toBe('fork-user/taskmaster-fork');
      expect(result.releaseUrl).toBe(
        'https://hub.docker.com/r/fork-user/taskmaster-fork/tags?name=1.3.0',
      );
      expect(safeFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/v2/namespaces/fork-user/repositories/taskmaster-fork/tags?page=1&page_size=100',
        ),
        expect.any(Object),
        expect.any(Object),
      );
    });

    it('should ignore Docker Hub prerelease and non-semver tags', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'TASKMASTER_IMAGE' ? 'mikaxy/taskmaster:latest' : undefined,
      );
      mockFetch(async () =>
        makeDockerTags(['latest', 'v2.0.0-beta.1', 'build-main', '1.4.0']),
      );

      const result = await service.getVersionStatus();

      expect(result.latestVersion).toBe('1.4.0');
      expect(result.updateAvailable).toBe(true);
      expect(result.sourceStatus).toBe('ok');
    });

    it('should return degraded status on complete Docker Hub failure', async () => {
      configGet.mockImplementation((key: string) =>
        key === 'TASKMASTER_IMAGE' ? 'mikaxy/taskmaster:latest' : undefined,
      );
      mockFetch(async () => {
        throw new Error('Docker Hub unavailable');
      });

      const result = await service.getVersionStatus();

      expect(result.repo).toBe('mikaxy/taskmaster');
      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBe('Unable to check for updates');
      expect(result.updateAvailable).toBe(false);
      expect(result.releaseUrl).toBeNull();
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
