import { TasksService } from './tasks.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import { InstanceService } from './instance.service';
import { AuditService } from '../audit/audit.service';
import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { GetTasksQueryDto } from './dto';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';

const makeFindMany = (tasks: any[]) => jest.fn().mockResolvedValue(tasks);

function makeService(findManyImpl = makeFindMany([])) {
  const prisma = {
    client: { task: { findMany: findManyImpl } },
    buildSiteFilter: () => ({}),
  } as unknown as PrismaService;

  const settings = {} as unknown as SettingsService;
  const instance = {} as unknown as InstanceService;
  const audit = {} as unknown as AuditService;
  const storage = {} as unknown as ProcedureStorageService;
  const beneficiary = {} as unknown as BeneficiaryResolverService;

  const config = { get: jest.fn() } as any;

  return new TasksService(
    prisma,
    config,
    settings,
    instance,
    audit,
    storage,
    beneficiary,
  );
}

function makeUser(role: string, sub = 42): JwtPayload {
  return { sub, username: 'test', role } as JwtPayload;
}

describe('TasksService.findAll — RBAC scoping', () => {
  it('USER gets scoped query (userAssignments filter)', async () => {
    const findMany = makeFindMany([]);
    const svc = makeService(findMany);
    await svc.findAll({} as GetTasksQueryDto, makeUser('USER'));

    const callArg = findMany.mock.calls[0][0];
    // The AND clause must contain a user-scoped OR filter
    const andClauses = callArg.where.AND as any[];
    const hasScopedFilter = andClauses.some((c) =>
      c.OR?.some((o: any) => o.userAssignments?.some?.userId === 42),
    );
    expect(hasScopedFilter).toBe(true);
  });

  it('GUEST is treated like USER — scoped, not global', async () => {
    const findMany = makeFindMany([]);
    const svc = makeService(findMany);
    await svc.findAll({} as GetTasksQueryDto, makeUser('GUEST'));

    const callArg = findMany.mock.calls[0][0];
    const andClauses = callArg.where.AND as any[];
    const hasScopedFilter = andClauses.some((c) =>
      c.OR?.some((o: any) => o.userAssignments?.some?.userId === 42),
    );
    expect(hasScopedFilter).toBe(true);
  });

  it('GUEST cannot use filterUserId to bypass scope', async () => {
    const findMany = makeFindMany([]);
    const svc = makeService(findMany);
    const query = { filterUserId: 999 } as unknown as GetTasksQueryDto;
    await svc.findAll(query, makeUser('GUEST'));

    const callArg = findMany.mock.calls[0][0];
    const andClauses = callArg.where.AND as any[];
    // filterUserId=999 must NOT appear — GUEST is scoped to self (sub=42)
    const hasGlobalUserFilter = andClauses.some(
      (c) => c.userAssignments?.some?.userId === 999,
    );
    expect(hasGlobalUserFilter).toBe(false);
  });

  it('SUPER_ADMIN can use filterUserId globally', async () => {
    const findMany = makeFindMany([]);
    const svc = makeService(findMany);
    const query = { filterUserId: 999 } as unknown as GetTasksQueryDto;
    await svc.findAll(query, makeUser('SUPER_ADMIN'));

    const callArg = findMany.mock.calls[0][0];
    const andClauses = callArg.where.AND as any[];
    const hasGlobalUserFilter = andClauses.some(
      (c) => c.userAssignments?.some?.userId === 999,
    );
    expect(hasGlobalUserFilter).toBe(true);
  });

  it('MANAGER can use filterGroupId globally', async () => {
    const findMany = makeFindMany([]);
    const svc = makeService(findMany);
    const query = { filterGroupId: 7 } as unknown as GetTasksQueryDto;
    await svc.findAll(query, makeUser('MANAGER'));

    const callArg = findMany.mock.calls[0][0];
    const andClauses = callArg.where.AND as any[];
    const hasGlobalGroupFilter = andClauses.some(
      (c) => c.groupAssignments?.some?.groupId === 7,
    );
    expect(hasGlobalGroupFilter).toBe(true);
  });
});
