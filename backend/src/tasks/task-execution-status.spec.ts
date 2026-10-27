import { ConfigService } from '@nestjs/config';
import { AuditService } from '../audit/audit.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings';
import { TasksService } from './tasks.service';
import type { NotificationsService } from '../notifications/notifications.service';
import { InstanceService } from './instance.service';
import { ProcedureStorageService } from './procedure-storage.service';

function fixture(notifications?: { dispatchTaskNotifications: jest.Mock }) {
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
    site: { findMany: jest.fn().mockResolvedValue([]) },
    status: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 9 }),
    },
    taskEvidence: { findMany: jest.fn().mockResolvedValue([]) },
    correctiveAction: { upsert: jest.fn().mockResolvedValue({ id: 4 }) },
    group: { findFirst: jest.fn() },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        username: 'operator',
        fullname: 'Olivia Operator',
      }),
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
    notifications as unknown as NotificationsService,
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
  describe('failure notification', () => {
    const notifications = () => ({
      dispatchTaskNotifications: jest.fn().mockResolvedValue(undefined),
    });
    const failed = {
      date: '2026-10-16',
      status: 'FAILED' as const,
      comment: 'Panel is dead',
      correctiveAction: { title: 'Repair panel' },
    };

    it('notifies once with what the occurrence needs to be a ticket', async () => {
      const notify = notifications();
      const { service, client } = fixture(notify);
      client.status.findUnique.mockResolvedValue({ status: 'RUNNING' });

      await service.setStatus(1, failed, 1, 'USER');

      expect(notify.dispatchTaskNotifications).toHaveBeenCalledWith(
        1,
        'FAILED',
        {
          instanceDate: '2026-10-16',
          comment: 'Panel is dead',
          actor: 'Olivia Operator',
          correctiveAction: 'Repair panel',
        },
      );
    });

    it('stays silent when the occurrence was already failed', async () => {
      const notify = notifications();
      const { service, client } = fixture(notify);
      client.status.findUnique.mockResolvedValue({ status: 'FAILED' });

      await service.setStatus(1, failed, 1, 'SUPER_ADMIN');

      expect(notify.dispatchTaskNotifications).not.toHaveBeenCalled();
    });

    it('stays silent for other statuses', async () => {
      const notify = notifications();
      const { service, client } = fixture(notify);
      client.status.findUnique.mockResolvedValue(null);

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

      expect(notify.dispatchTaskNotifications).not.toHaveBeenCalled();
    });

    it('does not fail the status change when the notification fails', async () => {
      const notify = notifications();
      notify.dispatchTaskNotifications.mockRejectedValue(
        new Error('smtp down'),
      );
      const { service } = fixture(notify);

      await expect(
        service.setStatus(1, failed, 1, 'USER'),
      ).resolves.toBeDefined();
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
  it('assigns a corrective action to a team of the task site, managers only', async () => {
    const { service, client } = fixture();
    client.group.findFirst.mockResolvedValue({ id: 7 });
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'FAILED',
          correctiveAction: { title: 'Repair', assigneeGroupId: 7 },
        },
        1,
        'USER',
      ),
    ).rejects.toThrow('Only a manager');
    await service.setStatus(
      1,
      {
        date: '2026-10-16',
        status: 'FAILED',
        correctiveAction: { title: 'Repair', assigneeGroupId: 7 },
      },
      1,
      'MANAGER',
    );
    expect(
      client.correctiveAction.upsert.mock.calls[0][0].create,
    ).toMatchObject({ assigneeId: null, assigneeGroupId: 7, createdById: 1 });
  });
  it('rejects a team from another site and a person plus a team', async () => {
    const { service, client } = fixture();
    client.group.findFirst.mockResolvedValue(null);
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'FAILED',
          correctiveAction: { title: 'Repair', assigneeGroupId: 9 },
        },
        1,
        'MANAGER',
      ),
    ).rejects.toThrow('task site');
    await expect(
      service.setStatus(
        1,
        {
          date: '2026-10-16',
          status: 'FAILED',
          correctiveAction: {
            title: 'Repair',
            assigneeId: 2,
            assigneeGroupId: 7,
          },
        },
        1,
        'MANAGER',
      ),
    ).rejects.toThrow('not both');
    expect(client.correctiveAction.upsert).not.toHaveBeenCalled();
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
