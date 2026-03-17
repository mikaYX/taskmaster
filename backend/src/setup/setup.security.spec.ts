import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { SetupGuard } from './setup.guard';
import { SetupService } from './setup.service';
import { PrismaService } from '../prisma';

// ─── SetupGuard Tests ───────────────────────────────────────────────

describe('SetupGuard', () => {
  let guard: SetupGuard;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (overrides: any = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip: '127.0.0.1',
        socket: { remoteAddress: '127.0.0.1' },
        headers: overrides.headers || {},
        body: overrides.body || {},
      }),
    }),
  });

  beforeEach(async () => {
    mockConfigService.get.mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetupGuard,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    guard = module.get<SetupGuard>(SetupGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should allow access when no BOOTSTRAP_SECRET is configured', () => {
    mockConfigService.get.mockReturnValue(undefined);
    const context = createMockContext();
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('should reject when BOOTSTRAP_SECRET is set but not provided', () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext();
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('should reject when wrong secret is provided via header', () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext({
      headers: { 'x-bootstrap-secret': 'wrong-secret-value' },
    });
    expect(() => guard.canActivate(context as any)).toThrow(ForbiddenException);
  });

  it('should allow when correct secret is provided via header', () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext({
      headers: { 'x-bootstrap-secret': 'my-super-secret-key!' },
    });
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('should allow when correct secret is provided via body', () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext({
      body: { bootstrapSecret: 'my-super-secret-key!' },
    });
    expect(guard.canActivate(context as any)).toBe(true);
  });

  it('should rate-limit after first attempt', () => {
    mockConfigService.get.mockReturnValue(undefined);
    const context = createMockContext();

    // First attempt passes
    expect(guard.canActivate(context as any)).toBe(true);

    // Second attempt should be rate-limited (within 5 min window)
    expect(() => guard.canActivate(context as any)).toThrow(HttpException);
  });
});

// ─── SetupService Tests ─────────────────────────────────────────────

describe('SetupService', () => {
  let service: SetupService;

  const mockTx = {
    user: {
      count: jest.fn(),
      create: jest.fn(),
    },
    site: {
      create: jest.fn(),
    },
    userSiteAssignment: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    client: {
      user: { count: jest.fn() },
      config: { upsert: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(mockTx)),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx.user.count.mockResolvedValue(0);
    mockTx.user.create.mockResolvedValue({ id: 1 });
    mockTx.site.create.mockResolvedValue({ id: 1 });
    mockTx.userSiteAssignment.create.mockResolvedValue({});
    mockPrisma.client.config.upsert.mockResolvedValue({});
    mockPrisma.client.user.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetupService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SetupService>(SetupService);
  });

  it('should successfully initialize when no admin exists', async () => {
    const result = await service.initializeAdmin('admin', 'StrongP@ss123!');
    expect(result.success).toBe(true);
    expect(mockTx.user.create).toHaveBeenCalledTimes(1);
  });

  it('should throw ConflictException if admin already exists', async () => {
    // Simulate: inside the transaction, count returns 1
    mockTx.user.count.mockResolvedValue(1);

    await expect(
      service.initializeAdmin('admin', 'StrongP@ss123!'),
    ).rejects.toThrow(ConflictException);
  });

  it('should NOT be possible to initialize twice (atomic lock)', async () => {
    // First call succeeds
    mockTx.user.count.mockResolvedValueOnce(0);
    const result1 = await service.initializeAdmin('admin', 'StrongP@ss123!');
    expect(result1.success).toBe(true);

    // Second call: count returns 1 (admin was just created)
    mockTx.user.count.mockResolvedValueOnce(1);
    await expect(
      service.initializeAdmin('admin2', 'StrongP@ss123!'),
    ).rejects.toThrow(ConflictException);
  });
});
