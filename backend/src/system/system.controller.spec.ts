import { UserRole } from '@prisma/client';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard, RolesGuard } from '../auth';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { SystemController } from './system.controller';
import { VersionService, VersionStatusDto } from './version.service';

describe('SystemController', () => {
  let controller: SystemController;
  let versionService: {
    getVersionStatus: jest.Mock;
    refreshVersionStatus: jest.Mock;
  };

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
      refreshVersionStatus: jest.fn().mockResolvedValue(mockDto),
    };

    controller = new SystemController(versionService as unknown as VersionService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should protect the controller with JWT and role guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SystemController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('should restrict version checks to privileged roles', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, SystemController.prototype.getVersion),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.MANAGER]);
    expect(
      Reflect.getMetadata(ROLES_KEY, SystemController.prototype.refreshVersion),
    ).toEqual([UserRole.SUPER_ADMIN, UserRole.MANAGER]);
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

  describe('POST /system/version/refresh', () => {
    it('should refresh and return version status', async () => {
      const result = await controller.refreshVersion();

      expect(result).toEqual(mockDto);
      expect(versionService.refreshVersionStatus).toHaveBeenCalledTimes(1);
    });
  });
});
