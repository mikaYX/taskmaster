import { Test, TestingModule } from '@nestjs/testing';
import { SystemController } from './system.controller';
import { VersionService, VersionStatusDto } from './version.service';

describe('SystemController', () => {
  let controller: SystemController;
  let versionService: { getVersionStatus: jest.Mock };

  const mockDto: VersionStatusDto = {
    currentVersion: '1.0.0',
    latestVersion: '1.2.0',
    updateAvailable: true,
    repo: 'mikaYX/taskmaster',
    releaseUrl: 'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
    checkedAt: '2026-03-14T12:00:00.000Z',
    sourceStatus: 'ok',
    error: null,
  };

  beforeEach(async () => {
    versionService = {
      getVersionStatus: jest.fn().mockResolvedValue(mockDto),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SystemController],
      providers: [{ provide: VersionService, useValue: versionService }],
    }).compile();

    controller = module.get<SystemController>(SystemController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /system/version', () => {
    it('should return version status', async () => {
      const result = await controller.getVersion();

      expect(result).toEqual(mockDto);
      expect(versionService.getVersionStatus).toHaveBeenCalledTimes(1);
    });

    it('should return degraded status when GitHub is unavailable', async () => {
      const degradedDto: VersionStatusDto = {
        ...mockDto,
        latestVersion: null,
        updateAvailable: false,
        releaseUrl: null,
        sourceStatus: 'degraded',
        error: 'Unable to check for updates',
      };
      versionService.getVersionStatus.mockResolvedValue(degradedDto);

      const result = await controller.getVersion();

      expect(result.sourceStatus).toBe('degraded');
      expect(result.error).toBe('Unable to check for updates');
    });
  });
});
