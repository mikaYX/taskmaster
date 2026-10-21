import { MissingTasksNotificationJob } from './missing-tasks-notification.job';

describe('MissingTasksNotificationJob', () => {
  const client = {
    status: { findMany: jest.fn() },
    notification: { findMany: jest.fn(), create: jest.fn() },
  };
  const notifications = { dispatchTaskNotifications: jest.fn() };
  const settings = { getRawValue: jest.fn() };
  const jobLock = {
    withLock: (_name: string, fn: () => Promise<void>) => fn(),
  };
  const job = new MissingTasksNotificationJob(
    { client } as never,
    notifications as never,
    settings as never,
    jobLock as never,
  );
  const overdue = (taskId: number) => ({
    taskId,
    instanceDate: new Date('2026-01-05T00:00:00Z'),
    task: { dueOffset: 60 },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    settings.getRawValue.mockResolvedValue(true);
    client.notification.create.mockResolvedValue({});
    notifications.dispatchTaskNotifications.mockResolvedValue(undefined);
  });

  it('bounds the scan and skips archived tasks', async () => {
    client.status.findMany.mockResolvedValue([]);
    await job.execute();

    const where = client.status.findMany.mock.calls[0][0].where;
    expect(where.instanceDate.gte).toBeInstanceOf(Date);
    expect(where.task).toEqual({ deletedAt: null });
    expect(client.notification.findMany).not.toHaveBeenCalled();
  });

  it('checks recent alerts in one query and only notifies the others', async () => {
    client.status.findMany.mockResolvedValue([overdue(1), overdue(2)]);
    client.notification.findMany.mockResolvedValue([{ taskId: 1 }]);

    await job.execute();

    expect(client.notification.findMany).toHaveBeenCalledTimes(1);
    expect(client.notification.findMany.mock.calls[0][0].where.taskId).toEqual({
      in: [1, 2],
    });
    expect(client.notification.create).toHaveBeenCalledTimes(1);
    expect(client.notification.create.mock.calls[0][0].data.taskId).toBe(2);
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledWith(
      2,
      'OVERDUE',
    );
  });
});
