import { Test, TestingModule } from '@nestjs/testing';
import { DelegationsService } from './delegations.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { BeneficiaryResolverService } from './beneficiary-resolver.service';
import {
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { CreateDelegationDto } from './dto/create-delegation.dto';

describe('DelegationsService', () => {
  let service: DelegationsService;
  let prisma: PrismaService;
  let auditService: AuditService;

  const mockPrismaService: any = {
    client: {
      taskDelegation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      taskDelegationTargetUser: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      taskDelegationTargetGroup: {
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn((callback) => callback(mockPrismaService.client)),
    },
  };

  const mockAuditService = {
    log: jest.fn(),
  };

  const mockBeneficiaryResolverService = {
    isEffectiveBeneficiary: jest.fn(),
    resolveBeneficiaryUserIdsFromDelegation: jest.fn().mockResolvedValue([]),
  };

  const mockEmailService = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelegationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditService, useValue: mockAuditService },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: BeneficiaryResolverService,
          useValue: mockBeneficiaryResolverService,
        },
      ],
    }).compile();

    service = module.get<DelegationsService>(DelegationsService);
    prisma = module.get<PrismaService>(PrismaService);
    auditService = module.get<AuditService>(AuditService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should throw BadRequestException if startAt is after or equal to endAt', async () => {
      const dto: CreateDelegationDto = {
        startAt: '2026-03-15T00:00:00Z',
        endAt: '2026-03-01T00:00:00Z', // Reversed dates
        targetUserIds: [2],
      };

      await expect(service.create(10, dto, 1)).rejects.toThrow(
        BadRequestException,
      );
      expect(
        mockPrismaService.client.taskDelegation.create,
      ).not.toHaveBeenCalled();
    });

    it('should successfully create a delegation and send an email notification', async () => {
      const dto: CreateDelegationDto = {
        startAt: '2026-03-01T00:00:00Z',
        endAt: '2026-03-15T00:00:00Z',
        targetUserIds: [2],
      };

      mockPrismaService.client.taskDelegation.create.mockResolvedValue({
        id: 1,
        ...dto,
      });
      mockBeneficiaryResolverService.resolveBeneficiaryUserIdsFromDelegation.mockResolvedValueOnce(
        [2],
      );
      mockPrismaService.client.user.findMany.mockResolvedValueOnce([
        { email: 'test@example.com' },
      ]);

      const result = await service.create(10, dto, 1);

      expect(mockPrismaService.client.taskDelegation.create).toHaveBeenCalled();
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELEGATION_CREATED' }),
      );
      expect(mockEmailService.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['test@example.com'],
          subject: expect.stringContaining('Nouvelle délégation'),
        }),
      );
      expect(result).toHaveProperty('id', 1);
    });

    it('should throw BadRequestException if no targets provided', async () => {
      const dto: CreateDelegationDto = {
        startAt: '2026-03-01T00:00:00Z',
        endAt: '2026-03-15T00:00:00Z',
      };

      await expect(service.create(10, dto, 1)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle Prisma overlapping Exception (P2010 no_overlapping_delegations)', async () => {
      const dto: CreateDelegationDto = {
        startAt: '2026-03-01T00:00:00Z',
        endAt: '2026-03-15T00:00:00Z',
        targetUserIds: [2],
      };

      const p2010Error = new Error('P2010: no_overlapping_delegations');
      (p2010Error as any).code = 'P2010';
      mockPrismaService.client.taskDelegation.create.mockRejectedValue(
        p2010Error,
      );

      await expect(service.create(10, dto, 1)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('findAll', () => {
    it('should return delegations for a task', async () => {
      const mockDelegations = [{ id: 1, taskId: 10 }];
      mockPrismaService.client.taskDelegation.findMany.mockResolvedValue(
        mockDelegations,
      );

      const result = await service.findAll(10);
      expect(result).toEqual(mockDelegations);
      expect(
        mockPrismaService.client.taskDelegation.findMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { taskId: 10 },
        }),
      );
    });
  });

  describe('update', () => {
    it('should clear users when targetUserIds is [] and keep groups', async () => {
      const existing = {
        id: 1,
        taskId: 10,
        targetUsers: [{ userId: 1 }],
        targetGroups: [{ groupId: 1 }],
      };
      mockPrismaService.client.taskDelegation.findUnique.mockResolvedValue(
        existing,
      );
      mockPrismaService.client.taskDelegation.update.mockResolvedValue({
        ...existing,
      });
      mockPrismaService.client.taskDelegationTargetUser.deleteMany.mockResolvedValue(
        { count: 1 },
      );

      const dto = { targetUserIds: [] };
      await service.update(10, 1, dto, 2);

      expect(
        mockPrismaService.client.taskDelegationTargetUser.deleteMany,
      ).toHaveBeenCalledWith({ where: { delegationId: 1 } });
      expect(
        mockPrismaService.client.taskDelegationTargetUser.createMany,
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.client.taskDelegationTargetGroup.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('should clear groups when targetGroupIds is [] and keep users', async () => {
      const existing = {
        id: 1,
        taskId: 10,
        targetUsers: [{ userId: 1 }],
        targetGroups: [{ groupId: 1 }],
      };
      mockPrismaService.client.taskDelegation.findUnique.mockResolvedValue(
        existing,
      );
      mockPrismaService.client.taskDelegation.update.mockResolvedValue({
        ...existing,
      });
      mockPrismaService.client.taskDelegationTargetGroup.deleteMany.mockResolvedValue(
        { count: 1 },
      );

      const dto = { targetGroupIds: [] };
      await service.update(10, 1, dto, 2);

      expect(
        mockPrismaService.client.taskDelegationTargetGroup.deleteMany,
      ).toHaveBeenCalledWith({ where: { delegationId: 1 } });
      expect(
        mockPrismaService.client.taskDelegationTargetGroup.createMany,
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.client.taskDelegationTargetUser.deleteMany,
      ).not.toHaveBeenCalled();
    });

    it('should reject when both targetUserIds and targetGroupIds are []', async () => {
      const existing = {
        id: 1,
        taskId: 10,
        targetUsers: [{ userId: 1 }],
        targetGroups: [{ groupId: 1 }],
      };
      mockPrismaService.client.taskDelegation.findUnique.mockResolvedValue(
        existing,
      );

      const dto = { targetUserIds: [], targetGroupIds: [] };

      await expect(service.update(10, 1, dto, 2)).rejects.toThrow(
        BadRequestException,
      );
      expect(
        mockPrismaService.client.taskDelegationTargetUser.deleteMany,
      ).not.toHaveBeenCalled();
      expect(
        mockPrismaService.client.taskDelegationTargetGroup.deleteMany,
      ).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('should delete a delegation and log it', async () => {
      mockPrismaService.client.taskDelegation.findUnique.mockResolvedValue({
        id: 1,
        taskId: 10,
      });
      mockPrismaService.client.taskDelegation.delete.mockResolvedValue({
        id: 1,
        taskId: 10,
      });

      await service.remove(10, 1, 1, 'admin');

      expect(
        mockPrismaService.client.taskDelegation.delete,
      ).toHaveBeenCalledWith({ where: { id: 1 } });
      expect(mockAuditService.log).toHaveBeenCalled();
    });
  });
});
