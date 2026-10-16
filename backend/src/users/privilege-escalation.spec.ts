import { SettingsService } from '../settings/settings.service';
import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth';
import { PrismaService } from '../prisma';
import { UsersService } from './users.service';

describe('UsersService - Privilege Escalation', () => {
  let service: UsersService;

  const mockPrisma = {
    client: {
      user: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      userSiteAssignment: {
        create: jest.fn(),
      },
    },
    getDefaultSiteId: jest.fn(),
  };

  const mockAuthService = {
    hashPassword: jest.fn().mockResolvedValue('hashed_password'),
    invalidateSession: jest.fn().mockResolvedValue(undefined),
  };

  const mockAuditService = {
    logDiff: jest.fn(),
    log: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: SettingsService, useValue: { getRawValue: jest.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update()', () => {
    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to grant SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({
        id: 2,
        role: 'USER',
      });

      await expect(
        service.update(2, { role: 'SUPER_ADMIN' } as any, {
          id: 1,
          username: 'manager1',
          role: 'MANAGER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a SUPER_ADMIN to grant SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({
        id: 2,
        role: 'USER',
      });
      mockPrisma.client.user.update.mockResolvedValue({
        id: 2,
        role: 'SUPER_ADMIN',
        groupMemberships: [],
      });

      const result = await service.update(2, { role: 'SUPER_ADMIN' } as any, {
        id: 1,
        username: 'superadmin1',
        role: 'SUPER_ADMIN',
      });

      expect(result.role).toBe('SUPER_ADMIN');
      expect(mockPrisma.client.user.update).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_CHANGED' }),
      );
    });

    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to revoke SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({
        id: 2,
        role: 'SUPER_ADMIN',
      });

      await expect(
        service.update(2, { role: 'USER' } as any, {
          id: 1,
          username: 'manager1',
          role: 'MANAGER',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to create a SUPER_ADMIN', async () => {
      mockPrisma.getDefaultSiteId.mockReturnValue(1);

      await expect(
        service.create(
          {
            username: 'newadmin',
            password: 'pwd',
            role: 'SUPER_ADMIN',
            fullname: 'New',
            email: 'a@a.com',
          } as any,
          { id: 1, username: 'manager1', role: 'MANAGER' },
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a SUPER_ADMIN to create a SUPER_ADMIN', async () => {
      mockPrisma.getDefaultSiteId.mockReturnValue(1);
      mockPrisma.client.user.create.mockResolvedValue({
        id: 3,
        username: 'newadmin',
        role: 'SUPER_ADMIN',
        groupMemberships: [],
      });

      await service.create(
        {
          username: 'newadmin',
          password: 'pwd',
          role: 'SUPER_ADMIN',
          fullname: 'New',
          email: 'a@a.com',
        } as any,
        { id: 1, username: 'superadmin1', role: 'SUPER_ADMIN' },
      );

      expect(mockPrisma.client.user.create).toHaveBeenCalled();
    });
  });
  it('invalidates the target session after an administrative password reset', async () => {
    mockPrisma.client.user.findFirst.mockResolvedValue({
      id: 2,
      username: 'operator',
      authProvider: 'LOCAL',
    });
    await service.resetPassword(2, 'Temporary!Password42');
    expect(mockPrisma.client.user.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { passwordHash: 'hashed_password', mustChangePassword: true },
    });
    expect(mockAuthService.invalidateSession).toHaveBeenCalledWith(2);
  });
});
