import { AuditScheduler } from './audit.scheduler';

/** Query shape of the MISSING audit: archived tasks are skipped, statuses are read once. */
describe('AuditScheduler.auditMissedInstances queries', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const instance = (taskId: number, iso: string) => ({
    taskId,
    date: day(iso),
    originalDate: day(iso),
    periodicity: 'rrule',
    periodStart: day(iso),
    periodEnd: new Date(`${iso}T18:00:00Z`),
  });

  const client = {
    notification: { findMany: jest.fn(), create: jest.fn() },
    task: { findMany: jest.fn() },
    site: { findMany: jest.fn() },
    status: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  };
  const instances = { computeInstances: jest.fn() };
  const settings = { getRawValue: jest.fn() };
  const scheduler = new AuditScheduler(
    { client } as never,
    instances as never,
    {} as never,
    settings as never,
    {
      dispatchTaskNotifications: jest.fn().mockResolvedValue(undefined),
    } as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    client.notification.findMany.mockResolvedValue([]);
    settings.getRawValue.mockResolvedValue(undefined);
    client.status.create.mockResolvedValue({});
    client.site.findMany.mockResolvedValue([]);
  });

  it('only audits tasks that are not archived', async () => {
    client.task.findMany.mockResolvedValue([]);
    await scheduler.auditMissedInstances();

    expect(client.task.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
    expect(client.status.findMany).not.toHaveBeenCalled();
  });

  it('loads the skipped and moved occurrences so they are not marked missing', async () => {
    client.task.findMany.mockResolvedValue([]);
    await scheduler.auditMissedInstances();

    const { include } = client.task.findMany.mock.calls[0][0];
    expect(include.overrides.where.OR).toEqual([
      { originalDate: { gte: expect.any(Date), lte: expect.any(Date) } },
      { targetDate: { gte: expect.any(Date), lte: expect.any(Date) } },
    ]);
  });

  it('reads existing statuses in one query and only creates the missing ones', async () => {
    client.task.findMany.mockResolvedValue([
      { id: 1, recurrenceMode: 'ON_SCHEDULE' },
      { id: 2, recurrenceMode: 'ON_SCHEDULE' },
    ]);
    client.status.findMany.mockResolvedValue([
      { taskId: 1, instanceDate: day('2026-01-05') },
      { taskId: 2, instanceDate: day('2026-01-06') },
    ]);
    instances.computeInstances.mockImplementation((task: { id: number }) =>
      [instance(task.id, '2026-01-05'), instance(task.id, '2026-01-06')][
        Symbol.iterator
      ](),
    );

    await scheduler.auditMissedInstances();

    expect(client.status.findMany).toHaveBeenCalledTimes(1);
    expect(client.status.findMany.mock.calls[0][0].where.taskId).toEqual({
      in: [1, 2],
    });
    const created = client.status.create.mock.calls.map(
      ([arg]: [{ data: { taskId: number; instanceDate: Date } }]) => [
        arg.data.taskId,
        arg.data.instanceDate.toISOString().slice(0, 10),
      ],
    );
    expect(created).toEqual([
      [1, '2026-01-06'],
      [2, '2026-01-05'],
    ]);
  });
});
