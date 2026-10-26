import {
  ConflictException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { PrismaService } from '../prisma';
import { SetupGuard } from './setup.guard';
import { SetupService } from './setup.service';

// ─── SetupGuard Tests ───────────────────────────────────────────────

describe('SetupGuard', () => {
  let guard: SetupGuard;
  let redisIncr: jest.Mock;
  let redisExpire: jest.Mock;
  let redisTtl: jest.Mock;
  let redisCount: number;

  const mockConfigService = {
    get: jest.fn(),
  };

  const createMockContext = (overrides: any = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip: overrides.ip || '127.0.0.1',
        socket: { remoteAddress: overrides.ip || '127.0.0.1' },
        headers: overrides.headers || {},
        body: overrides.body || {},
      }),
    }),
  });

  beforeEach(async () => {
    mockConfigService.get.mockReset();
    // Default Redis SET NX behaviour: first call returns 'OK', subsequent
    // calls return null (key already exists in the rate-limit window).
    redisCount = 0;
    redisIncr = jest.fn().mockImplementation(async () => ++redisCount);
    redisExpire = jest.fn().mockResolvedValue(1);
    redisTtl = jest.fn().mockResolvedValue(240);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SetupGuard,
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: REDIS_CLIENT,
          useValue: { incr: redisIncr, expire: redisExpire, ttl: redisTtl },
        },
      ],
    }).compile();

    guard = module.get<SetupGuard>(SetupGuard);
  });

  it('should reject when BOOTSTRAP_SECRET is not configured', async () => {
    mockConfigService.get.mockReturnValue(undefined);
    const context = createMockContext();
    await expect(guard.canActivate(context as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow setup when BOOTSTRAP_SECRET is configured server-side', async () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext();
    await expect(guard.canActivate(context as any)).resolves.toBe(true);
  });

  it('should rate-limit after 3 attempts (AUDIT #14 — distributed via Redis)', async () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    const context = createMockContext();

    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(context as any)).resolves.toBe(true);
    }

    // 4th attempt blocked, with an explicit message and the remaining wait
    await expect(guard.canActivate(context as any)).rejects.toThrow(
      /Trop de tentatives.*4 minutes/,
    );

    // The window is armed once, on the first attempt, for 5 minutes
    expect(redisIncr).toHaveBeenCalledTimes(4);
    expect(redisExpire).toHaveBeenCalledTimes(1);
    expect(redisExpire).toHaveBeenCalledWith(
      expect.stringContaining('setup:rate:'),
      300,
    );
  });

  it('should fall back to the in-memory map when Redis throws', async () => {
    mockConfigService.get.mockReturnValue('my-super-secret-key!');
    redisIncr.mockRejectedValue(new Error('ECONNREFUSED'));
    redisTtl.mockRejectedValue(new Error('ECONNREFUSED'));
    const context = createMockContext();

    // 3 attempts pass (Redis failed → in-memory fallback grants the slots)
    for (let i = 0; i < 3; i++) {
      await expect(guard.canActivate(context as any)).resolves.toBe(true);
    }

    // 4th attempt blocked by the in-memory map
    await expect(guard.canActivate(context as any)).rejects.toThrow(
      HttpException,
    );
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
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    userSiteAssignment: {
      create: jest.fn(),
    },
  };

  const mockPrisma = {
    client: {
      user: { count: jest.fn() },
      config: { upsert: jest.fn(), findUnique: jest.fn() },
      $transaction: jest.fn((cb: any) => cb(mockTx)),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockTx.user.count.mockResolvedValue(0);
    mockTx.user.create.mockResolvedValue({ id: 1 });
    mockTx.site.findFirst.mockResolvedValue(null);
    mockTx.site.create.mockResolvedValue({ id: 1 });
    mockTx.userSiteAssignment.create.mockResolvedValue({});
    mockPrisma.client.config.upsert.mockResolvedValue({});
    mockPrisma.client.config.findUnique.mockResolvedValue(null);
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
    expect(mockTx.site.create).toHaveBeenCalledTimes(1);
  });

  it('should reuse the existing default site when already seeded', async () => {
    mockTx.site.findFirst.mockResolvedValue({ id: 1 });

    const result = await service.initializeAdmin('admin', 'StrongP@ss123!');

    expect(result.success).toBe(true);
    expect(mockTx.site.create).not.toHaveBeenCalled();
    expect(mockTx.userSiteAssignment.create).toHaveBeenCalledWith({
      data: {
        userId: 1,
        siteId: 1,
        isDefault: true,
      },
    });
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

  // ── AUDIT #9 & #11 & #7 new behaviours ────────────────────────────

  it('should hash the admin password with the project-wide bcrypt cost (AUDIT #11)', async () => {
    await service.initializeAdmin('admin', 'StrongP@ss123!');

    const callArg = mockTx.user.create.mock.calls[0][0];
    const hash = callArg.data.passwordHash as string;
    // bcrypt prefix `$2a$12$` / `$2b$12$` confirms cost = 12 (not 10).
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
  });

  it('should persist the setup.completed flag after a successful run (AUDIT #7)', async () => {
    await service.initializeAdmin('admin', 'StrongP@ss123!');

    expect(mockPrisma.client.config.upsert).toHaveBeenCalledWith({
      where: { key: 'setup.completed' },
      create: { key: 'setup.completed', value: 'true' },
      update: { value: 'true' },
    });
  });

  it('stores the language and time zone chosen in the wizard like the settings service does', async () => {
    await service.initializeAdmin('admin', 'StrongP@ss123!', {
      language: 'en',
      timezone: 'America/New_York',
    });

    expect(mockPrisma.client.config.upsert).toHaveBeenCalledWith({
      where: { key: 'ui.language' },
      create: { key: 'ui.language', value: '"en"' },
      update: { value: '"en"' },
    });
    expect(mockPrisma.client.config.upsert).toHaveBeenCalledWith({
      where: { key: 'scheduler.timezone' },
      create: { key: 'scheduler.timezone', value: '"America/New_York"' },
      update: { value: '"America/New_York"' },
    });
  });

  it('leaves the language and time zone defaults alone when none was chosen', async () => {
    await service.initializeAdmin('admin', 'StrongP@ss123!');

    const keys = mockPrisma.client.config.upsert.mock.calls.map(
      ([arg]: [{ where: { key: string } }]) => arg.where.key,
    );
    expect(keys).not.toContain('ui.language');
    expect(keys).not.toContain('scheduler.timezone');
  });

  it('needsSetup() should return false as soon as setup.completed=true is persisted, even with no admin', async () => {
    mockPrisma.client.config.findUnique.mockResolvedValue({ value: 'true' });
    mockPrisma.client.user.count.mockResolvedValue(0);

    await expect(service.needsSetup()).resolves.toBe(false);
    // Short-circuit: we must NOT have queried the user table at all
    expect(mockPrisma.client.user.count).not.toHaveBeenCalled();
  });

  it('needsSetup() returns true when neither flag nor admin exists', async () => {
    mockPrisma.client.config.findUnique.mockResolvedValue(null);
    mockPrisma.client.user.count.mockResolvedValue(0);

    await expect(service.needsSetup()).resolves.toBe(true);
  });
});
