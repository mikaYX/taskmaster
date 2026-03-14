import { Test, TestingModule } from '@nestjs/testing';
import { DelegationSchedulerService } from './delegation-scheduler.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BeneficiaryResolverService } from './beneficiary-resolver.service';
import { EmailService } from '../../email/email.service';
import { SettingsService } from '../../settings/settings.service';

describe('DelegationSchedulerService', () => {
  let service: DelegationSchedulerService;
  let prismaService: PrismaService;
  let emailService: EmailService;
  let beneficiaryResolverService: BeneficiaryResolverService;

  const mockPrisma = {
    client: {
      taskDelegation: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
    },
  };

  const mockEmailService = {
    send: jest.fn(),
  };

  const mockBeneficiaryResolverService = {
    resolveBeneficiaryUserIdsFromDelegation: jest.fn(),
  };
  const mockSettingsService = {
    getRawValue: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DelegationSchedulerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EmailService, useValue: mockEmailService },
        {
          provide: BeneficiaryResolverService,
          useValue: mockBeneficiaryResolverService,
        },
        { provide: SettingsService, useValue: mockSettingsService },
      ],
    }).compile();

    service = module.get<DelegationSchedulerService>(
      DelegationSchedulerService,
    );
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    beneficiaryResolverService = module.get<BeneficiaryResolverService>(
      BeneficiaryResolverService,
    );

    jest.clearAllMocks();
    mockSettingsService.getRawValue.mockResolvedValue(true);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should not crash if list is empty', async () => {
    mockPrisma.client.taskDelegation.findMany.mockResolvedValue([]);
    await expect(service.handleExpiredDelegations()).resolves.not.toThrow();
    expect(mockPrisma.client.taskDelegation.updateMany).not.toHaveBeenCalled();
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('should skip execution when scheduler is disabled', async () => {
    mockSettingsService.getRawValue.mockResolvedValue(false);

    await service.handleExpiredDelegations();

    expect(mockPrisma.client.taskDelegation.findMany).not.toHaveBeenCalled();
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('should process expired delegation, send email, and mark as notified', async () => {
    const expiredDelegation = {
      id: 1,
      taskId: 10,
      delegatedById: 42,
      targetUsers: [],
      targetGroups: [],
    };

    mockPrisma.client.taskDelegation.findMany.mockResolvedValue([
      expiredDelegation,
    ]);
    mockPrisma.client.taskDelegation.updateMany.mockResolvedValue({ count: 1 });
    mockBeneficiaryResolverService.resolveBeneficiaryUserIdsFromDelegation.mockResolvedValue(
      [100, 101],
    );
    mockPrisma.client.user.findMany.mockResolvedValue([
      { id: 100, email: 'user1@example.com' },
      { id: 101, email: 'user2@example.com' },
      { id: 42, email: 'admin@example.com' },
    ]);

    await service.handleExpiredDelegations();

    expect(mockPrisma.client.taskDelegation.updateMany).toHaveBeenCalledWith({
      where: { id: 1, expiredNotifiedAt: null },
      data: { expiredNotifiedAt: expect.any(Date) },
    });
    expect(mockEmailService.send).toHaveBeenCalledWith({
      to: ['user1@example.com', 'user2@example.com', 'admin@example.com'],
      subject: 'Expiration de votre délégation (Tâche #10)',
      text: expect.stringContaining(
        "Votre délégation concernant la Tâche #10 a expiré aujourd'hui.",
      ),
    });
  });

  it('should handle idempotence: no email sent if updateMany count is 0', async () => {
    const expiredDelegation = {
      id: 2,
      taskId: 20,
      delegatedById: 42,
    };

    mockPrisma.client.taskDelegation.findMany.mockResolvedValue([
      expiredDelegation,
    ]);
    // simulate race condition where another worker already processed it
    mockPrisma.client.taskDelegation.updateMany.mockResolvedValue({ count: 0 });

    await service.handleExpiredDelegations();

    expect(mockPrisma.client.taskDelegation.updateMany).toHaveBeenCalled();
    expect(
      mockBeneficiaryResolverService.resolveBeneficiaryUserIdsFromDelegation,
    ).not.toHaveBeenCalled();
    expect(mockEmailService.send).not.toHaveBeenCalled();
  });

  it('should include delegator and beneficiaries without duplicates', async () => {
    const expiredDelegation = {
      id: 3,
      taskId: 30,
      delegatedById: 42, // same as one of the beneficiaries
    };

    mockPrisma.client.taskDelegation.findMany.mockResolvedValue([
      expiredDelegation,
    ]);
    mockPrisma.client.taskDelegation.updateMany.mockResolvedValue({ count: 1 });
    mockBeneficiaryResolverService.resolveBeneficiaryUserIdsFromDelegation.mockResolvedValue(
      [42, 100, 100],
    ); // duplicate mock

    mockPrisma.client.user.findMany.mockImplementation(async (args) => {
      // Verify deduplication in the query arguments
      expect(args.where.id.in).toEqual(expect.arrayContaining([42, 100]));
      expect(args.where.id.in.length).toBe(2);
      return [
        { id: 42, email: 'admin@example.com' },
        { id: 100, email: 'user@example.com' },
      ];
    });

    await service.handleExpiredDelegations();

    expect(mockEmailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: ['admin@example.com', 'user@example.com'], // Deduplicated
      }),
    );
  });
});
