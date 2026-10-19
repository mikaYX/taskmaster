import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getToken } from '@willsoto/nestjs-prometheus';
import { PrismaService } from '../prisma';
import {
  RefreshInProgressException,
  RefreshTokenService,
} from './refresh-token.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { SettingsService } from '../settings/settings.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: PrismaService;
  let redisMock: { set: jest.Mock; del: jest.Mock; get: jest.Mock };
  let settingsMock: { getRawValue: jest.Mock };

  beforeEach(async () => {
    settingsMock = { getRawValue: jest.fn().mockResolvedValue('30') };
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'), // Lock always acquired in unit tests
      del: jest.fn().mockResolvedValue(1),
      get: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        {
          provide: PrismaService,
          useValue: {
            client: {
              refreshToken: {
                findUnique: jest.fn(),
                create: jest.fn(),
                update: jest.fn(),
                updateMany: jest.fn(),
              },
            },
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue: unknown) => {
                if (key === 'AUTH_GRACE_WINDOW_SECONDS') return 10;
                return defaultValue;
              }),
          },
        },
        {
          provide: SettingsService,
          useValue: settingsMock,
        },
        {
          provide: REDIS_CLIENT,
          useValue: redisMock,
        },
        {
          provide: getToken('auth_refresh_success_total'),
          useValue: { inc: jest.fn() },
        },
        {
          provide: getToken('auth_refresh_failure_total'),
          useValue: { inc: jest.fn() },
        },
        {
          provide: getToken('auth_refresh_reuse_in_grace_total'),
          useValue: { inc: jest.fn() },
        },
        {
          provide: getToken('auth_refresh_reuse_out_of_grace_total'),
          useValue: { inc: jest.fn() },
        },
        {
          provide: getToken('auth_refresh_revoke_family_total'),
          useValue: { inc: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RefreshTokenService>(RefreshTokenService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  describe('rotateToken', () => {
    it('should rotate a valid raw token', async () => {
      const mockToken = {
        userId: 1,
        familyId: 'family123',
        expiresAt: new Date(Date.now() + 1000000),
        user: { id: 1, deletedAt: null },
      };

      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        mockToken,
      );
      (prisma.client.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });
      jest.spyOn(service, 'createToken').mockResolvedValue({
        token: 'new-token',
        expiresAt: new Date(),
      });

      const result = await service.rotateToken('validToken');
      expect(result).toBeDefined();
      expect(result?.userId).toBe(1);
      expect(result?.token).toBe('new-token');
      expect(prisma.client.refreshToken.updateMany).toHaveBeenCalled();
      expect(service.createToken).toHaveBeenCalled();
    });

    it('should ask the caller to retry (409) and NOT revoke family if token revoked WITHIN grace window', async () => {
      const mockToken = {
        userId: 1,
        familyId: 'family123',
        revokedAt: new Date(Date.now() - 5000), // revoked 5s ago (within 10s window)
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 1, deletedAt: null },
      };

      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        mockToken,
      );
      jest.spyOn(service, 'revokeFamily').mockResolvedValue(undefined);

      await expect(
        service.rotateToken('revokedTokenInGraceWindow'),
      ).rejects.toBeInstanceOf(RefreshInProgressException);
      expect(service.revokeFamily).not.toHaveBeenCalled();
    });

    it('should return null and DO revoke family if token revoked OUTSIDE grace window', async () => {
      const mockToken = {
        userId: 1,
        familyId: 'family456',
        revokedAt: new Date(Date.now() - 30000), // revoked 30s ago (> 10s window)
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 1, deletedAt: null },
      };

      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        mockToken,
      );
      jest.spyOn(service, 'revokeFamily').mockResolvedValue(undefined);

      const result = await service.rotateToken(
        'revokedTokenOutsideGraceWindow',
      );

      expect(result).toBeNull();
      expect(service.revokeFamily).toHaveBeenCalledWith('family456');
    });

    it('should revoke token and return null if expired', async () => {
      const mockToken = {
        userId: 1,
        familyId: 'family123',
        expiresAt: new Date(Date.now() - 1000000), // expired
        user: { id: 1, deletedAt: null },
      };

      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        mockToken,
      );
      jest.spyOn(service, 'revokeToken').mockResolvedValue(undefined);

      const result = await service.rotateToken('expiredToken');
      expect(result).toBeNull();
      expect(service.revokeToken).toHaveBeenCalled();
    });

    it('should revoke token and return null if user is deleted', async () => {
      const mockToken = {
        userId: 1,
        familyId: 'family123',
        expiresAt: new Date(Date.now() + 1000000),
        user: { id: 1, deletedAt: new Date() }, // deleted
      };

      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        mockToken,
      );
      jest.spyOn(service, 'revokeToken').mockResolvedValue(undefined);

      const result = await service.rotateToken('deletedUserToken');
      expect(result).toBeNull();
      expect(service.revokeToken).toHaveBeenCalled();
    });

    it('should ask the caller to retry (409) if the Redis lock cannot be acquired (concurrent refresh)', async () => {
      redisMock.set.mockResolvedValue(null); // Lock not acquired — another request holds it

      await expect(
        service.rotateToken('concurrentToken'),
      ).rejects.toBeInstanceOf(RefreshInProgressException);
      // Prisma should NOT have been queried — lock blocked early
      expect(prisma.client.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('should ask the caller to retry (409) if another request rotated the token first (compare-and-swap lost)', async () => {
      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue({
        userId: 1,
        familyId: 'family789',
        revokedAt: null,
        expiresAt: new Date(Date.now() + 100000),
        user: { id: 1, deletedAt: null, role: 'USER' },
      });
      (prisma.client.refreshToken.updateMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await expect(service.rotateToken('racedToken')).rejects.toBeInstanceOf(
        RefreshInProgressException,
      );
      expect(prisma.client.refreshToken.create).not.toHaveBeenCalled();
    });

    it('keeps a real invalid token a plain null so the cookie IS cleared', async () => {
      (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
        null,
      );

      await expect(service.rotateToken('unknownToken')).resolves.toBeNull();
    });

    describe('session policy (auth.session.timeout)', () => {
      const minutesFromNow = (date: Date) =>
        Math.round((date.getTime() - Date.now()) / 60_000);

      it.each([
        ['30', 30],
        ['1440', 1440], // the value asked for: a full day
        ['5', 5],
        ['1', 5], // below the minimum of the settings screen
        ['999999', 1440], // above the maximum
        ['abc', 30],
        ['', 30],
        [undefined, 30],
        ['-10', 30],
        ['0', 30],
      ])(
        'a user token follows the setting %p -> %i minutes',
        async (raw, minutes) => {
          settingsMock.getRawValue.mockResolvedValue(raw);

          const created = await service.createToken(
            1,
            'ua',
            '10.0.0.1',
            undefined,
            'USER',
          );

          expect(minutesFromNow(created.expiresAt)).toBe(minutes);
        },
      );

      it.each(['USER', 'MANAGER', 'SUPER_ADMIN'])(
        'applies to a %s as well',
        async (role) => {
          settingsMock.getRawValue.mockResolvedValue('1440');

          const created = await service.createToken(
            1,
            'ua',
            '10.0.0.1',
            undefined,
            role,
          );

          expect(minutesFromNow(created.expiresAt)).toBe(1440);
        },
      );

      it('keeps a TV (GUEST) screen signed in for a year whatever the policy says', async () => {
        settingsMock.getRawValue.mockResolvedValue('30');

        const created = await service.createToken(
          9,
          'ua',
          '10.0.0.1',
          undefined,
          'GUEST',
        );

        expect(minutesFromNow(created.expiresAt)).toBe(365 * 24 * 60);
      });

      it('falls back to the default when the setting cannot be read', async () => {
        settingsMock.getRawValue.mockRejectedValue(new Error('db down'));

        const created = await service.createToken(
          1,
          'ua',
          '10.0.0.1',
          undefined,
          'USER',
        );

        expect(minutesFromNow(created.expiresAt)).toBe(30);
      });
    });

    describe('the policy is enforced on rotation too', () => {
      /** A token as stored before the policy was changed: it still carries a 7-day expiry. */
      const tokenIdleFor = (minutes: number, role = 'USER') => ({
        userId: 1,
        familyId: 'family-policy',
        revokedAt: null,
        createdAt: new Date(Date.now() - minutes * 60_000),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60_000),
        user: { id: 1, deletedAt: null, role },
      });

      const rotate = async (
        token: ReturnType<typeof tokenIdleFor>,
        timeout: string,
      ) => {
        settingsMock.getRawValue.mockResolvedValue(timeout);
        (prisma.client.refreshToken.findUnique as jest.Mock).mockResolvedValue(
          token,
        );
        (prisma.client.refreshToken.updateMany as jest.Mock).mockResolvedValue({
          count: 1,
        });
        return service.rotateToken('some-token');
      };

      it('signs out someone away for longer than the timeout, even if the stored expiry is later', async () => {
        await expect(rotate(tokenIdleFor(31), '30')).resolves.toBeNull();

        // revoked, not rotated
        expect(prisma.client.refreshToken.update).toHaveBeenCalled();
        expect(prisma.client.refreshToken.create).not.toHaveBeenCalled();
      });

      it('keeps someone who is back within the timeout', async () => {
        await expect(rotate(tokenIdleFor(29), '30')).resolves.not.toBeNull();
      });

      it('with 1440 minutes, a day is respected to the minute', async () => {
        await expect(
          rotate(tokenIdleFor(1439), '1440'),
        ).resolves.not.toBeNull();
        await expect(rotate(tokenIdleFor(1441), '1440')).resolves.toBeNull();
      });

      it('the same 31-minute absence is fine once the timeout is raised to a day', async () => {
        await expect(rotate(tokenIdleFor(31), '1440')).resolves.not.toBeNull();
      });

      it('never signs a TV screen out because of the user timeout', async () => {
        await expect(
          rotate(tokenIdleFor(3 * 24 * 60, 'GUEST'), '30'),
        ).resolves.not.toBeNull();
      });

      it('gives the rotated token a whole new period', async () => {
        const rotated = await rotate(tokenIdleFor(600), '1440');

        expect(
          Math.round((rotated!.expiresAt.getTime() - Date.now()) / 60_000),
        ).toBe(1440);
      });
    });
  });

  describe('createToken — GDPR IP anonymization (AUDIT.md #8 / §15.3)', () => {
    it('masks the last octet of an IPv4 before persistence', async () => {
      await service.createToken(1, 'ua', '192.168.1.42');

      expect(prisma.client.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ipAddress: '192.168.1.0' }),
      });
    });

    it('masks the last 80 bits of an IPv6 before persistence', async () => {
      await service.createToken(1, 'ua', '2001:db8:abcd::1');

      expect(prisma.client.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ipAddress: '2001:db8:abcd::' }),
      });
    });

    it('persists undefined when no IP is supplied (Prisma stores NULL)', async () => {
      await service.createToken(1, 'ua');

      expect(prisma.client.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ipAddress: undefined }),
      });
    });

    it('persists undefined for malformed IPs (anonymizer drops bad input)', async () => {
      await service.createToken(1, 'ua', 'not-an-ip');

      expect(prisma.client.refreshToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ipAddress: undefined }),
      });
    });
  });
});
