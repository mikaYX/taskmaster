import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ClsService } from 'nestjs-cls';
import { CompositeAuthGuard } from './composite-auth.guard';
import { PrismaService } from '../../prisma';

// We need to mock AuthGuard to avoid Passport strategy initialization
jest.mock('@nestjs/passport', () => ({
  AuthGuard: () => {
    class MockAuthGuard {
      async canActivate() {
        return true;
      }
    }
    return MockAuthGuard;
  },
}));

describe('CompositeAuthGuard — tenant isolation', () => {
  let guard: CompositeAuthGuard;

  const mockCls = {
    set: jest.fn(),
    get: jest.fn(),
  };

  const mockPrisma = {
    client: {
      userSiteAssignment: {
        findMany: jest.fn(),
      },
    },
  };

  const createMockContext = (user: any, headers: Record<string, string> = {}) => ({
    switchToHttp: () => ({
      getRequest: () => ({
        user,
        headers,
      }),
    }),
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Default: user has site 1 and site 2
    mockPrisma.client.userSiteAssignment.findMany.mockResolvedValue([
      { siteId: 1, isDefault: true },
      { siteId: 2, isDefault: false },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CompositeAuthGuard,
        { provide: ClsService, useValue: mockCls },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    guard = module.get<CompositeAuthGuard>(CompositeAuthGuard);
  });

  it('should allow request without X-Site-Id header', async () => {
    const ctx = createMockContext({ sub: 1, role: 'MANAGER' });
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
  });

  it('should allow MANAGER to access assigned site via X-Site-Id', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'MANAGER' },
      { 'x-site-id': '1' },
    );
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(mockCls.set).toHaveBeenCalledWith('selectedSiteId', 1);
  });

  it('should reject MANAGER accessing unassigned site via X-Site-Id', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'MANAGER' },
      { 'x-site-id': '999' },
    );
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow SUPER_ADMIN to access any site via X-Site-Id', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'SUPER_ADMIN' },
      { 'x-site-id': '999' },
    );
    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(mockCls.set).toHaveBeenCalledWith('selectedSiteId', 999);
  });

  it('should REJECT API_KEY without X-Site-Id header', async () => {
    const ctx = createMockContext(
      { id: 'apikey:1', role: 'API_KEY' },
    );
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('should allow API_KEY with valid X-Site-Id and inject tenant scope', async () => {
    const user = { id: 'apikey:1', role: 'API_KEY' };
    const ctx = createMockContext(user, { 'x-site-id': '42' });

    await expect(guard.canActivate(ctx as any)).resolves.toBe(true);
    expect(mockCls.set).toHaveBeenCalledWith('selectedSiteId', 42);
    // Verify sites were injected for buildSiteFilter()
    expect((user as any).sites).toEqual([{ siteId: 42, isDefault: true }]);
  });

  it('should reject invalid X-Site-Id (non-numeric)', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'MANAGER' },
      { 'x-site-id': 'abc' },
    );
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject X-Site-Id with negative value', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'MANAGER' },
      { 'x-site-id': '-1' },
    );
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should reject X-Site-Id with zero value', async () => {
    const ctx = createMockContext(
      { sub: 1, role: 'MANAGER' },
      { 'x-site-id': '0' },
    );
    await expect(guard.canActivate(ctx as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should load site assignments and enrich user object', async () => {
    const user = { sub: 42, role: 'MANAGER' };
    const ctx = createMockContext(user);

    await guard.canActivate(ctx as any);

    expect(mockPrisma.client.userSiteAssignment.findMany).toHaveBeenCalledWith({
      where: { userId: 42 },
      select: { siteId: true, isDefault: true },
    });
    // User object should be enriched with sites
    expect(user).toHaveProperty('sites');
  });

  it('should NOT load site assignments for API_KEY users', async () => {
    const user = { id: 'apikey:1', role: 'API_KEY' };
    const ctx = createMockContext(user, { 'x-site-id': '1' });

    await guard.canActivate(ctx as any);

    expect(
      mockPrisma.client.userSiteAssignment.findMany,
    ).not.toHaveBeenCalled();
  });
});
