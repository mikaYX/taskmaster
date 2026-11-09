import { InstanceService } from '../../tasks/instance.service';
import { RecurrenceService } from '../../tasks/recurrence.service';
import { MissingTasksNotificationJob } from './missing-tasks-notification.job';

describe('MissingTasksNotificationJob', () => {
  const client = {
    $transaction: jest.fn(),
    $executeRaw: jest.fn(),
    status: { findMany: jest.fn() },
    site: { findMany: jest.fn().mockResolvedValue([]) },
    notification: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const notifications = { dispatchTaskNotifications: jest.fn() };
  const job = new MissingTasksNotificationJob(
    { client } as never,
    notifications as never,
    new InstanceService(new RecurrenceService()),
    { getRawValue: jest.fn() } as never,
    { register: jest.fn() } as never,
  );
  const overdue = (taskId: number) => ({
    taskId,
    instanceDate: new Date('2026-01-05T00:00:00Z'),
    task: {
      id: taskId,
      dueOffset: 60,
      startDate: new Date('2026-01-05T00:00:00Z'),
      rrule: 'FREQ=DAILY',
      timezone: 'UTC',
    },
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-01-06T20:00:00Z'));
    client.$transaction.mockImplementation((run) => run(client));
    client.notification.updateMany.mockResolvedValue({ count: 1 });
    client.notification.deleteMany.mockResolvedValue({ count: 1 });
    client.site.findMany.mockResolvedValue([]);
    client.notification.findMany.mockResolvedValue([]);
    client.notification.create.mockResolvedValue({});
    client.notification.delete.mockResolvedValue({});
    notifications.dispatchTaskNotifications.mockResolvedValue(undefined);
  });

  afterEach(() => jest.useRealTimers());

  it.each([
    ['2026-05-04T09:00:00Z', 'UTC', '2026-05-04', 'FREQ=DAILY', false, 0],
    ['2026-05-04T18:00:00Z', 'UTC', '2026-05-04', 'FREQ=DAILY', false, 0],
    ['2026-05-04T18:01:00Z', 'UTC', '2026-05-04', 'FREQ=DAILY', false, 1],
    [
      '2026-05-04T19:00:00Z',
      'America/New_York',
      '2026-05-04',
      'FREQ=DAILY',
      false,
      0,
    ],
    [
      '2026-05-04T22:01:00Z',
      'America/New_York',
      '2026-05-04',
      'FREQ=DAILY',
      false,
      1,
    ],
    ['2026-05-01T20:00:00Z', 'UTC', '2026-05-01', 'FREQ=DAILY', true, 0],
    ['2026-05-04T20:00:00Z', 'UTC', '2026-05-04', 'FREQ=WEEKLY', false, 0],
  ])(
    'respects deadline/holiday at %s in %s (%s %s %s)',
    async (now, timezone, date, rrule, skipHolidays, count) => {
      jest.setSystemTime(new Date(now));
      client.status.findMany.mockResolvedValue([
        {
          taskId: 1,
          instanceDate: new Date(`${date}T00:00:00Z`),
          task: {
            id: 1,
            startDate: new Date(`${date}T12:00:00Z`),
            rrule,
            timezone,
            dueOffset: 0,
            skipHolidays,
            useGlobalWindowDefaults: false,
            windowStartTime: '08:00',
            windowEndTime: '18:00',
          },
        },
      ]);
      await job.execute();
      expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(
        count,
      );
    },
  );

  it('retries a failed delivery on the next tick and records only success', async () => {
    client.status.findMany.mockResolvedValue([overdue(1)]);
    notifications.dispatchTaskNotifications.mockRejectedValueOnce(
      new Error('offline'),
    );
    await expect(job.execute()).rejects.toThrow('offline');
    expect(client.notification.deleteMany).toHaveBeenCalledWith({
      where: { taskId: 1, kind: 'pending:OVERDUE', sentAt: expect.any(Date) },
    });
    jest.advanceTimersByTime(3600000);
    await job.execute();
    expect(client.notification.create).toHaveBeenCalledTimes(2);
    client.notification.findMany.mockResolvedValue([{ taskId: 1 }]);
    jest.advanceTimersByTime(3600000);
    await job.execute();
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(2);
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
      { deliveryKey: 'hourly' },
    );
  });
});
