import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { ConfigService } from '@nestjs/config';
import { TasksService } from '../src/tasks/tasks.service';
import { TaskExecutionService } from '../src/tasks/task-execution.service';
import { PrismaService } from '../src/prisma';
import { SettingsService } from '../src/settings';
import { InstanceService } from '../src/tasks/instance.service';
import { AuditService } from '../src/audit/audit.service';
import { ProcedureStorageService } from '../src/tasks/procedure-storage.service';
import { BeneficiaryResolverService } from '../src/modules/delegations/beneficiary-resolver.service';
import type { JwtPayload } from '../src/auth/strategies/jwt.strategy';

const testUrl = process.env.TASKMASTER_EXECUTION_TEST_DATABASE_URL;
const postgresTests = testUrl ? describe : describe.skip;

postgresTests('execution against isolated PostgreSQL', () => {
  let client: PrismaClient;
  let pool: Pool;
  let tasks: TasksService;
  let execution: TaskExecutionService;
  let siteId: number;
  let userId: number;
  let root: string;
  let originalRoot: string | undefined;
  const date = new Date().toISOString().slice(0, 10);
  const checklist = [
    {
      id: 'check',
      label: 'Original inspection label',
      kind: 'CHECK',
      required: true,
    },
  ];
  const actor = () => ({ sub: userId, role: 'USER' }) as JwtPayload;

  beforeAll(async () => {
    // Never fall back to DATABASE_URL: this suite must explicitly target a test DB.
    if (!new URL(testUrl!).pathname.endsWith('/taskmaster_execution_test'))
      throw new Error('Use a database named taskmaster_execution_test');
    pool = new Pool({ connectionString: testUrl });
    client = new PrismaClient({ adapter: new PrismaPg(pool) });
    siteId = (
      await client.site.create({
        data: { name: 'Execution tests', code: randomUUID() },
      })
    ).id;
    userId = (
      await client.user.create({
        data: { username: `execution-${randomUUID()}` },
      })
    ).id;
    const prisma = {
      client,
      getUserSiteIds: () => [siteId],
      buildSiteFilter: () => ({ siteId }),
    } as unknown as PrismaService;
    const beneficiary = {
      isEffectiveBeneficiary: jest
        .fn()
        .mockResolvedValue({ isBeneficiary: true }),
    } as unknown as BeneficiaryResolverService;
    const instances = {
      computeInstances: () => [
        { date: new Date(date), periodEnd: new Date(Date.now() + 3600000) },
      ],
    } as unknown as InstanceService;
    tasks = new TasksService(
      prisma,
      {} as ConfigService,
      { getRawValue: async () => null } as unknown as SettingsService,
      instances,
      {} as AuditService,
      {} as ProcedureStorageService,
      beneficiary,
    );
    execution = new TaskExecutionService(prisma, beneficiary);
    root = mkdtempSync(join(tmpdir(), 'taskmaster-pg-evidence-'));
    originalRoot = process.env.TASKMASTER_DATA_DIR;
    process.env.TASKMASTER_DATA_DIR = root;
  });
  afterAll(async () => {
    if (client) {
      if (siteId) await client.task.deleteMany({ where: { siteId } });
      if (siteId) await client.site.delete({ where: { id: siteId } });
      if (userId) await client.user.delete({ where: { id: userId } });
      await client.$disconnect();
    }
    await pool?.end();
    if (originalRoot === undefined) delete process.env.TASKMASTER_DATA_DIR;
    else process.env.TASKMASTER_DATA_DIR = originalRoot;
    if (root) rmSync(root, { recursive: true, force: true });
  });
  const createTask = (steps = checklist) =>
    client.task.create({
      data: {
        name: 'Inspection',
        description: 'Test inspection',
        periodicity: 'daily',
        startDate: new Date(date),
        siteId,
        executionChecklist: steps,
        userAssignments: { create: { userId, siteId } },
      },
    });

  it('keeps tasks without a checklist compatible', async () => {
    const task = await createTask([]);
    await tasks.setStatus(task.id, { date, status: 'SUCCESS' }, userId, 'USER');
    expect(
      (
        await client.status.findUniqueOrThrow({
          where: {
            taskId_instanceDate: {
              taskId: task.id,
              instanceDate: new Date(date),
            },
          },
        })
      ).executionRecord,
    ).toBeNull();
  });
  it('preserves historical labels after editing a task definition', async () => {
    const task = await createTask();
    await tasks.setStatus(
      task.id,
      {
        date,
        status: 'SUCCESS',
        executionAnswers: [{ id: 'check', value: true }],
      },
      userId,
      'USER',
    );
    await client.task.update({
      where: { id: task.id },
      data: {
        executionChecklist: [{ ...checklist[0], label: 'Renamed label' }],
      },
    });
    const status = await client.status.findUniqueOrThrow({
      where: {
        taskId_instanceDate: { taskId: task.id, instanceDate: new Date(date) },
      },
    });
    expect(status.executionRecord).toEqual([{ ...checklist[0], value: true }]);
  });
  it('creates only one corrective action on retry and closes it without changing the failed control', async () => {
    const task = await createTask();
    const submission = {
      date,
      status: 'FAILED' as const,
      correctiveAction: { title: 'Replace the panel' },
    };
    await tasks.setStatus(task.id, submission, userId, 'SUPER_ADMIN');
    await tasks.setStatus(task.id, submission, userId, 'SUPER_ADMIN');
    const actions = await client.correctiveAction.findMany({
      where: { taskId: task.id },
    });
    expect(actions).toHaveLength(1);
    await execution.updateAction(
      actions[0].id,
      'CLOSED',
      'Panel replaced and tested',
      actor(),
    );
    expect(
      (
        await client.correctiveAction.findUniqueOrThrow({
          where: { id: actions[0].id },
        })
      ).state,
    ).toBe('CLOSED');
    expect(
      (
        await client.status.findUniqueOrThrow({
          where: {
            taskId_instanceDate: {
              taskId: task.id,
              instanceDate: new Date(date),
            },
          },
        })
      ).status,
    ).toBe('FAILED');
  });
  it('rolls back the failure status when the corrective action cannot be saved', async () => {
    const task = await createTask();
    await expect(
      tasks.setStatus(
        task.id,
        {
          date,
          status: 'FAILED',
          correctiveAction: { title: 'x'.repeat(300) },
        },
        userId,
        'MANAGER',
      ),
    ).rejects.toThrow();
    expect(await client.status.count({ where: { taskId: task.id } })).toBe(0);
    expect(
      await client.correctiveAction.count({ where: { taskId: task.id } }),
    ).toBe(0);
  });
  it('saves and retrieves private evidence for the correct occurrence', async () => {
    const task = await createTask([
      {
        id: 'photo',
        label: 'Photo of the panel',
        kind: 'PHOTO',
        required: true,
      },
    ]);
    const photo = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    const evidence = await execution.upload(task.id, date, photo, actor());
    await tasks.setStatus(
      task.id,
      {
        date,
        status: 'SUCCESS',
        executionAnswers: [{ id: 'photo', value: evidence.id }],
      },
      userId,
      'USER',
    );
    const downloaded = await execution.download(task.id, evidence.id, actor());
    const chunks: Buffer[] = [];
    for await (const chunk of downloaded.stream) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks)).toEqual(photo);
  });
  it('paginates filtered actions without leaking another site or another user', async () => {
    const task = await createTask([]);
    const otherSite = await client.site.create({
      data: { name: 'Other site', code: randomUUID() },
    });
    const otherUser = await client.user.create({
      data: { username: `other-${randomUUID()}` },
    });
    const otherTask = await client.task.create({
      data: {
        name: 'Other task',
        description: '',
        periodicity: 'daily',
        startDate: new Date(date),
        siteId: otherSite.id,
      },
    });
    try {
      const base = {
        title: 'Pagination marker',
        assigneeId: userId,
        createdById: userId,
        dueDate: new Date('2020-01-01'),
      };
      await client.correctiveAction.createMany({
        data: Array.from({ length: 53 }, (_, index) => ({
          ...base,
          taskId: task.id,
          instanceDate: new Date(Date.UTC(2020, 0, index + 1)),
        })),
      });
      await client.correctiveAction.createMany({
        data: [
          {
            ...base,
            taskId: otherTask.id,
            instanceDate: new Date('2020-01-01'),
          },
          {
            ...base,
            taskId: task.id,
            instanceDate: new Date('2021-01-01'),
            assigneeId: otherUser.id,
            createdById: otherUser.id,
            title: 'Hidden marker',
          },
          {
            ...base,
            taskId: task.id,
            instanceDate: new Date('2021-01-02'),
            state: 'CLOSED',
          },
          {
            ...base,
            taskId: task.id,
            instanceDate: new Date('2021-01-03'),
            dueDate: null,
          },
          {
            ...base,
            taskId: task.id,
            instanceDate: new Date('2021-01-04'),
            dueDate: new Date('2026-10-16'),
          },
        ],
      });
      const filters = {
        state: 'OPEN' as const,
        search: 'pagination MARKER',
        mine: 'true',
        overdueBefore: '2026-10-16',
      };
      const first = await execution.searchActions(actor(), filters);
      const second = await execution.searchActions(actor(), {
        ...filters,
        page: 2,
      });
      expect(first.total).toBe(53);
      expect(first.items).toHaveLength(50);
      expect(second.items).toHaveLength(3);
      expect(
        new Set([...first.items, ...second.items].map((item) => item.id)).size,
      ).toBe(53);
      expect(
        (await execution.searchActions(actor(), { search: 'Hidden marker' }))
          .total,
      ).toBe(0);
      expect(
        (
          await execution.searchActions(
            { ...actor(), role: 'SUPER_ADMIN' },
            { search: 'Hidden marker' },
          )
        ).total,
      ).toBe(1);
    } finally {
      await client.task.delete({ where: { id: task.id } });
      await client.task.delete({ where: { id: otherTask.id } });
      await client.site.delete({ where: { id: otherSite.id } });
      await client.user.delete({ where: { id: otherUser.id } });
    }
  });
});
