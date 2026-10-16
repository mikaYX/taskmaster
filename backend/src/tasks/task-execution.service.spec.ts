import { mkdtempSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { PrismaService } from '../prisma';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TaskExecutionService } from './task-execution.service';

const user = { sub: 1, role: 'USER' } as JwtPayload;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);

describe('private evidence and corrective actions', () => {
  let root: string;
  let originalRoot: string | undefined;
  const client = {
    $transaction: jest.fn((promises) => Promise.all(promises)),
    task: { findFirst: jest.fn() },
    taskEvidence: { create: jest.fn(), findFirst: jest.fn() },
    correctiveAction: {
      findMany: jest.fn(),
      count: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  };
  const prisma = {
    client,
    buildSiteFilter: jest.fn().mockReturnValue({ siteId: 1 }),
    getUserSiteIds: jest.fn().mockReturnValue([1]),
  };
  const beneficiary = {
    isEffectiveBeneficiary: jest
      .fn()
      .mockResolvedValue({ isBeneficiary: false }),
  };
  let service: TaskExecutionService;

  beforeEach(() => {
    originalRoot = process.env.TASKMASTER_DATA_DIR;
    root = mkdtempSync(join(tmpdir(), 'taskmaster-evidence-'));
    process.env.TASKMASTER_DATA_DIR = root;
    jest.clearAllMocks();
    client.task.findFirst.mockResolvedValue({
      id: 2,
      siteId: 1,
      userAssignments: [{ userId: 1 }],
      groupAssignments: [],
      executionChecklist: [{ kind: 'PHOTO' }],
    });
    client.taskEvidence.create.mockImplementation(({ data }) =>
      Promise.resolve(data),
    );
    service = new TaskExecutionService(
      prisma as unknown as PrismaService,
      beneficiary as unknown as BeneficiaryResolverService,
    );
  });
  afterEach(() => {
    if (originalRoot === undefined) delete process.env.TASKMASTER_DATA_DIR;
    else process.env.TASKMASTER_DATA_DIR = originalRoot;
    rmSync(root, { recursive: true, force: true });
  });

  it('stores a UUID-named private photo tied to the task, occurrence and actor', async () => {
    const result = await service.upload(2, '2026-10-16', png, user);
    expect(result).toMatchObject({
      taskId: 2,
      instanceDate: new Date('2026-10-16'),
      uploaderId: 1,
      mimeType: 'image/png',
      size: png.length,
    });
    expect(readdirSync(join(root, 'storage', 'evidence'))).toEqual([result.id]);
  });
  it('cleans up a photo if its database write fails', async () => {
    client.taskEvidence.create.mockRejectedValue(
      new Error('database unavailable'),
    );
    await expect(service.upload(2, '2026-10-16', png, user)).rejects.toThrow(
      'database unavailable',
    );
    expect(readdirSync(join(root, 'storage', 'evidence'))).toEqual([]);
  });
  it('denies guests, users outside the site and nonbeneficiaries', async () => {
    await expect(
      service.upload(2, '2026-10-16', png, { ...user, role: 'GUEST' }),
    ).rejects.toThrow();
    client.task.findFirst.mockResolvedValueOnce({ id: 2, siteId: 9 });
    await expect(service.upload(2, '2026-10-16', png, user)).rejects.toThrow(
      'outside the selected site',
    );
    client.task.findFirst.mockResolvedValueOnce({
      id: 2,
      siteId: 1,
      userAssignments: [],
      groupAssignments: [],
    });
    await expect(service.upload(2, '2026-10-16', png, user)).rejects.toThrow(
      'not assigned',
    );
    expect(client.taskEvidence.create).not.toHaveBeenCalled();
  });
  it('rejects nonimages, oversized files and impossible dates', async () => {
    await expect(
      service.upload(2, '2026-10-16', Buffer.from('<svg/>'), user),
    ).rejects.toThrow('PNG');
    await expect(service.upload(2, '2026-02-31', png, user)).rejects.toThrow(
      'date',
    );
    await expect(
      service.upload(2, '2026-10-16', Buffer.alloc(5 * 1024 * 1024 + 1), user),
    ).rejects.toThrow('PNG');
  });
  it('scopes action lists to sites and actor or assignee for a normal user', async () => {
    await service.listActions(user);
    expect(
      client.correctiveAction.findMany.mock.calls[0][0].where,
    ).toMatchObject({
      task: { siteId: 1 },
      OR: [{ assigneeId: 1 }, { createdById: 1 }],
    });
  });
  it('requires a resolution and ownership to close an action', async () => {
    client.correctiveAction.findFirst.mockResolvedValue({
      id: 3,
      assigneeId: 1,
      resolution: null,
      closedAt: null,
      task: { siteId: 1 },
    });
    await expect(service.updateAction(3, 'CLOSED', '', user)).rejects.toThrow(
      'resolution',
    );
    await service.updateAction(3, 'CLOSED', 'Panel replaced', user);
    expect(client.correctiveAction.update).toHaveBeenCalledWith({
      where: { id: 3 },
      data: {
        state: 'CLOSED',
        resolution: 'Panel replaced',
        closedAt: expect.any(Date),
      },
    });
    client.correctiveAction.update.mockClear();
    await expect(
      service.updateAction(3, 'CLOSED', 'Done', { ...user, sub: 4 }),
    ).rejects.toThrow('assignee');
    expect(client.correctiveAction.update).not.toHaveBeenCalled();
  });
  it('search and mine filters cannot bypass user visibility or site access', async () => {
    client.correctiveAction.findMany.mockResolvedValue([]);
    client.correctiveAction.count.mockResolvedValue(0);
    const result = await service.searchActions(user, {
      search: 'panel',
      mine: 'true',
      state: 'OPEN',
      page: 2,
    });
    expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 50 });
    const args = client.correctiveAction.findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual(
      expect.arrayContaining([
        { task: { siteId: 1, deletedAt: null } },
        { OR: [{ assigneeId: 1 }, { createdById: 1 }] },
        { assigneeId: 1 },
        { state: 'OPEN' },
      ]),
    );
    expect(
      args.where.AND.find((condition) =>
        condition.OR?.some((item) => item.title),
      ),
    ).toBeDefined();
    expect(args).toMatchObject({ skip: 50, take: 50 });
    expect(client.correctiveAction.count).toHaveBeenCalledWith({
      where: args.where,
    });
  });
  it('overdue excludes closed, undated and today actions using a strict date cutoff', async () => {
    await service.searchActions(
      { ...user, role: 'SUPER_ADMIN' },
      { overdueBefore: '2026-10-16' },
    );
    expect(client.correctiveAction.findMany.mock.calls[0][0].where.AND).toEqual(
      expect.arrayContaining([
        { task: { siteId: 1, deletedAt: null } },
        { state: 'OPEN', dueDate: { lt: new Date('2026-10-16T00:00:00Z') } },
      ]),
    );
  });
});
