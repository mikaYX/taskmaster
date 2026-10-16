import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings';
import { TasksService } from './tasks.service';
import { InstanceService } from './instance.service';
import { ProcedureStorageService } from './procedure-storage.service';

function fixture() {
  const task = {
    id: 1,
    siteId: 1,
    executionChecklist: [
      { id: 'check', label: 'Inspect', kind: 'CHECK', required: true },
    ],
    userAssignments: [{ userId: 1 }],
    groupAssignments: [],
  };
  const client = {
    task: { findUnique: jest.fn().mockResolvedValue(task) },
    status: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 9 }),
    },
    taskEvidence: { findMany: jest.fn().mockResolvedValue([]) },
    correctiveAction: { upsert: jest.fn().mockResolvedValue({ id: 4 }) },
    user: {
      findUnique: jest.fn().mockResolvedValue({ username: 'operator' }),
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation(
    (callback: (tx: typeof client) => Promise<unknown>) => callback(client),
  );
  const prisma = {
    client,
    getUserSiteIds: jest.fn().mockReturnValue([1]),
    buildSiteFilter: jest.fn().mockReturnValue({ siteId: 1 }),
  };
  const instances = {
    computeInstances: jest.fn().mockReturnValue([
      {
        date: new Date('2026-10-16T00:00:00Z'),
        periodEnd: new Date('2026-10-16T18:00:00Z'),
      },
    ]),
  };
  const service = new TasksService(
    prisma as unknown as PrismaService,
    {} as ConfigService,
    {
      getRawValue: jest.fn().mockResolvedValue(null),
    } as unknown as SettingsService,
    instances as unknown as InstanceService,
    {} as AuditService,
    {} as ProcedureStorageService,
    {} as BeneficiaryResolverService,
  );
  return { task, client, prisma, service, instances };
}

describe('checklist status submission', () => {
  beforeEach(() =>
    jest.useFakeTimers().setSystemTime(new Date('2026-10-16T09:00:00Z')),
  );
  afterEach(() => jest.useRealTimers());

  it('saves a completed checklist snapshot with the occurrence status', async () => {
    const { service, client } = fixture();
    await service.setStatus(
      1,
      {
        date: '2026-10-16',
        status: 'SUCCESS',
        executionAnswers: [{ id: 'check', value: true }],
      },
      1,
      'USER',
    );
    expect(
      client.status.upsert.mock.calls[0][0].create.executionRecord,
    ).toEqual([
      {
        id: 'check',
        label: 'Inspect',
        kind: 'CHECK',
        required: true,
        value: true,
      },
    ]);
  });
  it('blocks success without required answers and prevents cross-site submissions', async () => {
    const { service, client, prisma } = fixture();
    await expect(
      service.setStatus(
        1,
        { date: '2026-10-16', status: 'SUCCESS' },
        1,
        'USER',
      ),
    ).rejects.toThrow('incomplete');
    prisma.getUserSiteIds.mockReturnValue([2]);
    await expect(
      service.setStatus(1, { date: '2026-10-16', status: 'FAILED' }, 1, 'USER'),
    ).rejects.toThrow('outside your sites');
    expect(client.status.upsert).not.toHaveBeenCalled();
  });
  it('respects an explicit site scope even for a super administrator', async () => {
    const { service, client, prisma } = fixture();
    prisma.buildSiteFilter.mockReturnValue({ siteId: 2 });
    await expect(
      service.setStatus(
        1,
        { date: '2026-10-16', status: 'FAILED' },
        1,
        'SUPER_ADMIN',
      ),
    ).rejects.toThrow('selected site');
    expect(client.status.upsert).not.toHaveBeenCalled();
  });

  it('rejects evidence copied from another occurrence', async () => {
    const { service, task, client } = fixture();
    task.executionChecklist[0].kind = 'PHOTO';
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'SUCCESS',
          executionAnswers: [
            { id: 'check', value: '12345678-1234-4234-8234-123456789012' },
          ],
        },
        1,
        'USER',
      ),
    ).rejects.toThrow('does not belong');
    expect(client.status.upsert).not.toHaveBeenCalled();
  });
  it('writes failure and corrective action together in a transaction', async () => {
    const { service, client } = fixture();
    await service.setStatus(
      1,
      {
        date: '2026-10-16',
        status: 'FAILED',
        correctiveAction: { title: 'Repair panel', dueDate: '2026-10-20' },
      },
      1,
      'USER',
    );
    expect(client.$transaction).toHaveBeenCalledTimes(1);
    expect(client.correctiveAction.upsert.mock.calls[0][0]).toMatchObject({
      where: {
        taskId_instanceDate: {
          taskId: 1,
          instanceDate: new Date('2026-10-16'),
        },
      },
      create: { title: 'Repair panel', assigneeId: 1, createdById: 1 },
      update: {},
    });
  });
  it('rejects corrective actions for success and nonmanager reassignment', async () => {
    const { service, client } = fixture();
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'SUCCESS',
          executionAnswers: [{ id: 'check', value: true }],
          correctiveAction: { title: 'Repair' },
        },
        1,
        'USER',
      ),
    ).rejects.toThrow('failed occurrence');
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'FAILED',
          correctiveAction: { title: 'Repair', assigneeId: 2 },
        },
        1,
        'USER',
      ),
    ).rejects.toThrow('Only a manager');
    expect(client.status.upsert).not.toHaveBeenCalled();
  });
  it('keeps completed-status overrides restricted to administrators', async () => {
    const { service, client } = fixture();
    client.status.findUnique.mockResolvedValue({ status: 'FAILED' });
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'SUCCESS',
          executionAnswers: [{ id: 'check', value: true }],
        },
        1,
        'MANAGER',
      ),
    ).rejects.toThrow('Only an admin');
    expect(client.status.upsert).not.toHaveBeenCalled();
  });

  it('rejects nonexistent scheduled occurrences', async () => {
    const { service, instances } = fixture();
    instances.computeInstances.mockReturnValue([]);
    await expect(
      service.setStatus(1, { date: '2026-10-16', status: 'FAILED' }, 1, 'USER'),
    ).rejects.toThrow('No scheduled occurrence');
  });
});
