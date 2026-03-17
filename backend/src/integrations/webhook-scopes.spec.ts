import { ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ScopesGuard } from '../auth/guards/scopes.guard';
import { IntegrationsService } from './integrations.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { StatusService } from '../status/status.service';
import { Permission } from '../auth/permissions.enum';
import { SCOPES_KEY } from '../auth/decorators/require-scopes.decorator';

// ─── ScopesGuard Tests ──────────────────────────────────────────────

describe('ScopesGuard', () => {
  let guard: ScopesGuard;
  let reflector: Reflector;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ScopesGuard, Reflector],
    }).compile();

    guard = module.get<ScopesGuard>(ScopesGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (user: any) => ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  });

  it('should pass when no scopes are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({ role: 'API_KEY', permissions: [] });
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('should pass for JWT users even with required scopes', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.TASK_CREATE]);
    const ctx = createMockContext({ role: 'SUPER_ADMIN', permissions: [] });
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('should pass for API key with matching scopes', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.TASK_CREATE]);
    const ctx = createMockContext({
      id: 'apikey:1',
      role: 'API_KEY',
      permissions: [Permission.TASK_CREATE, Permission.TASK_UPDATE],
    });
    expect(guard.canActivate(ctx as any)).toBe(true);
  });

  it('should reject API key with missing scopes', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.TASK_CREATE, Permission.TASK_DELETE]);
    const ctx = createMockContext({
      id: 'apikey:1',
      role: 'API_KEY',
      permissions: [Permission.TASK_CREATE], // Missing TASK_DELETE
    });
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });

  it('should reject API key with no permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.TASK_CREATE]);
    const ctx = createMockContext({
      id: 'apikey:2',
      role: 'API_KEY',
      permissions: [],
    });
    expect(() => guard.canActivate(ctx as any)).toThrow(ForbiddenException);
  });

  it('should throw 403 with message listing missing scopes', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([Permission.TASK_CREATE, Permission.TASK_DELETE]);
    const ctx = createMockContext({
      id: 'apikey:3',
      role: 'API_KEY',
      permissions: [],
    });
    try {
      guard.canActivate(ctx as any);
      fail('Should have thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ForbiddenException);
      expect(e.message).toContain('task:create');
      expect(e.message).toContain('task:delete');
    }
  });
});

// ─── IntegrationsService Scope + Tenant Validation Tests ────────────

describe('IntegrationsService — scope & tenant validation', () => {
  let service: IntegrationsService;

  const mockTasksService = {
    create: jest.fn(),
    softDelete: jest.fn(),
  };

  const mockStatusService = {
    upsert: jest.fn(),
  };

  const mockPrisma = {
    client: {
      task: {
        findFirst: jest.fn(),
      },
    },
    buildSiteFilter: jest.fn().mockReturnValue({ siteId: 1 }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: task belongs to tenant (findFirst returns the task)
    mockPrisma.client.task.findFirst.mockResolvedValue({ id: 1 });
    mockPrisma.buildSiteFilter.mockReturnValue({ siteId: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TasksService, useValue: mockTasksService },
        { provide: StatusService, useValue: mockStatusService },
      ],
    }).compile();

    service = module.get<IntegrationsService>(IntegrationsService);
  });

  // ── Scope validation ────────────────────────────────────────────

  it('should reject CREATE_TASK for API key without task:create scope', async () => {
    const user = { role: 'API_KEY', permissions: [Permission.TASK_UPDATE] };
    const dto = { source: 'test', action: 'CREATE_TASK', payload: {} };

    await expect(
      service.processIncomingWebhook(dto as any, user),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject COMPLETE_TASK for API key without task:update scope', async () => {
    const user = { role: 'API_KEY', permissions: [Permission.TASK_CREATE] };
    const dto = {
      source: 'test',
      action: 'COMPLETE_TASK',
      payload: { taskId: 1, instanceDate: '2024-01-01' },
    };

    await expect(
      service.processIncomingWebhook(dto as any, user),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should reject DELETE_TASK for API key without task:delete scope', async () => {
    const user = { role: 'API_KEY', permissions: [Permission.TASK_CREATE] };
    const dto = { source: 'test', action: 'DELETE_TASK', payload: { taskId: 1 } };

    await expect(
      service.processIncomingWebhook(dto as any, user),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should allow CREATE_TASK for API key with task:create scope', async () => {
    const user = { role: 'API_KEY', permissions: [Permission.TASK_CREATE] };
    const dto = {
      source: 'test',
      action: 'CREATE_TASK',
      payload: {
        name: 'Test',
        periodicity: 'DAILY',
        startDate: '2024-01-01',
      },
    };

    mockTasksService.create.mockResolvedValue({ id: 42 });

    const result = await service.processIncomingWebhook(dto as any, user);
    expect(result.success).toBe(true);
    expect(result.taskId).toBe(42);
  });

  it('should allow COMPLETE_TASK for API key with task:update scope', async () => {
    const user = {
      role: 'API_KEY',
      sub: 1,
      username: 'api-test',
      permissions: [Permission.TASK_UPDATE],
    };
    const dto = {
      source: 'test',
      action: 'COMPLETE_TASK',
      payload: { taskId: 1, instanceDate: '2024-01-01' },
    };

    mockStatusService.upsert.mockResolvedValue({ id: 1, status: 'SUCCESS' });

    const result = await service.processIncomingWebhook(dto as any, user);
    expect(result.success).toBe(true);
  });

  it('should allow all actions for JWT users (role-based) regardless of scopes', async () => {
    const jwtUser = { role: 'SUPER_ADMIN', sub: 1, username: 'admin' };
    const dto = {
      source: 'test',
      action: 'CREATE_TASK',
      payload: {
        name: 'Test',
        periodicity: 'DAILY',
        startDate: '2024-01-01',
      },
    };

    mockTasksService.create.mockResolvedValue({ id: 99 });

    const result = await service.processIncomingWebhook(dto as any, jwtUser);
    expect(result.success).toBe(true);
  });

  // ── Tenant isolation ────────────────────────────────────────────

  it('should reject COMPLETE_TASK if task does not belong to caller tenant', async () => {
    // Task not found in tenant scope → findFirst returns null
    mockPrisma.client.task.findFirst.mockResolvedValue(null);

    const user = {
      role: 'API_KEY',
      sub: 1,
      username: 'api-test',
      permissions: [Permission.TASK_UPDATE],
    };
    const dto = {
      source: 'test',
      action: 'COMPLETE_TASK',
      payload: { taskId: 999, instanceDate: '2024-01-01' },
    };

    await expect(
      service.processIncomingWebhook(dto as any, user),
    ).rejects.toThrow(NotFoundException);
  });

  it('should reject DELETE_TASK if task does not belong to caller tenant', async () => {
    mockPrisma.client.task.findFirst.mockResolvedValue(null);

    const user = {
      role: 'API_KEY',
      sub: 1,
      permissions: [Permission.TASK_DELETE],
    };
    const dto = {
      source: 'test',
      action: 'DELETE_TASK',
      payload: { taskId: 999 },
    };

    await expect(
      service.processIncomingWebhook(dto as any, user),
    ).rejects.toThrow(NotFoundException);
  });

  it('should verify tenant filter is applied when checking task ownership', async () => {
    mockPrisma.buildSiteFilter.mockReturnValue({ siteId: 42 });
    mockPrisma.client.task.findFirst.mockResolvedValue({ id: 1 });
    mockStatusService.upsert.mockResolvedValue({ id: 1 });

    const user = {
      role: 'API_KEY',
      sub: 1,
      username: 'api-test',
      permissions: [Permission.TASK_UPDATE],
    };
    const dto = {
      source: 'test',
      action: 'COMPLETE_TASK',
      payload: { taskId: 1, instanceDate: '2024-01-01' },
    };

    await service.processIncomingWebhook(dto as any, user);

    // Verify buildSiteFilter was called and its result was spread into findFirst
    expect(mockPrisma.buildSiteFilter).toHaveBeenCalled();
    expect(mockPrisma.client.task.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 1,
          siteId: 42,
          deletedAt: null,
        }),
      }),
    );
  });
});

