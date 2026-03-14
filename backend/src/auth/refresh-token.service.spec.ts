import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getToken } from '@willsoto/nestjs-prometheus';
import { PrismaService } from '../prisma';
import { RefreshTokenService } from './refresh-token.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let prisma: PrismaService;
  let redisMock: { set: jest.Mock; del: jest.Mock; get: jest.Mock };

  beforeEach(async () => {
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

    it('should return null and NOT revoke family if token revoked WITHIN grace window', async () => {
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

      const result = await service.rotateToken('revokedTokenInGraceWindow');

      expect(result).toBeNull();
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

    it('should return null if Redis lock cannot be acquired (concurrent refresh)', async () => {
      redisMock.set.mockResolvedValue(null); // Lock not acquired — another request holds it

      const result = await service.rotateToken('concurrentToken');
      expect(result).toBeNull();
      // Prisma should NOT have been queried — lock blocked early
      expect(prisma.client.refreshToken.findUnique).not.toHaveBeenCalled();
    });
  });
});
