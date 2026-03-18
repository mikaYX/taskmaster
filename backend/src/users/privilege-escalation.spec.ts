import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma';
import { AuthService } from '../auth';
import { AuditService } from '../audit/audit.service';
import { ForbiddenException, ConflictException } from '@nestjs/common';

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
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuthService, useValue: mockAuthService },
        { provide: AuditService, useValue: mockAuditService },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('update()', () => {
    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to grant SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({ id: 2, role: 'USER' });

      await expect(
        service.update(
          2,
          { role: 'SUPER_ADMIN' } as any,
          { id: 1, username: 'manager1', role: 'MANAGER' }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a SUPER_ADMIN to grant SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({ id: 2, role: 'USER' });
      mockPrisma.client.user.update.mockResolvedValue({ id: 2, role: 'SUPER_ADMIN', groupMemberships: [] });

      const result = await service.update(
        2,
        { role: 'SUPER_ADMIN' } as any,
        { id: 1, username: 'superadmin1', role: 'SUPER_ADMIN' }
      );

      expect(result.role).toBe('SUPER_ADMIN');
      expect(mockPrisma.client.user.update).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'USER_ROLE_CHANGED' })
      );
    });

    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to revoke SUPER_ADMIN role', async () => {
      mockPrisma.client.user.findFirst.mockResolvedValue({ id: 2, role: 'SUPER_ADMIN' });

      await expect(
        service.update(
          2,
          { role: 'USER' } as any,
          { id: 1, username: 'manager1', role: 'MANAGER' }
        )
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('create()', () => {
    it('should throw ForbiddenException if a non-SUPER_ADMIN tries to create a SUPER_ADMIN', async () => {
      mockPrisma.getDefaultSiteId.mockReturnValue(1);
      
      await expect(
        service.create(
          { username: 'newadmin', password: 'pwd', role: 'SUPER_ADMIN', fullname: 'New', email: 'a@a.com' } as any,
          { id: 1, username: 'manager1', role: 'MANAGER' }
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow a SUPER_ADMIN to create a SUPER_ADMIN', async () => {
      mockPrisma.getDefaultSiteId.mockReturnValue(1);
      mockPrisma.client.user.create.mockResolvedValue({ id: 3, username: 'newadmin', role: 'SUPER_ADMIN', groupMemberships: [] });

      await service.create(
        { username: 'newadmin', password: 'pwd', role: 'SUPER_ADMIN', fullname: 'New', email: 'a@a.com' } as any,
        { id: 1, username: 'superadmin1', role: 'SUPER_ADMIN' }
      );

      expect(mockPrisma.client.user.create).toHaveBeenCalled();
    });
  });
});
