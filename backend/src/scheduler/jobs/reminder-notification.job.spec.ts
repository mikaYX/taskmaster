import { ReminderNotificationJob } from './reminder-notification.job';

describe('ReminderNotificationJob', () => {
  const client = { status: { findMany: jest.fn() } };
  const settings = { getRawValue: jest.fn() };
  const notifications = { dispatchTaskNotifications: jest.fn() };
  const job = new ReminderNotificationJob(
    { client } as never,
    settings as never,
    notifications as never,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    settings.getRawValue.mockResolvedValue(undefined);
    notifications.dispatchTaskNotifications.mockResolvedValue(undefined);
  });

  it('dispatches reminders without a global reminder switch', async () => {
    client.status.findMany.mockResolvedValue([{ taskId: 3 }]);

    await job.execute();

    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledWith(
      3,
      'REMINDER',
    );
  });

  it('only looks at running occurrences inside the reminder window', async () => {
    client.status.findMany.mockResolvedValue([]);

    await job.execute();

    const where = client.status.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('RUNNING');
    expect(where.instanceDate.gte).toBeInstanceOf(Date);
    expect(where.instanceDate.lte).toBeInstanceOf(Date);
    expect(notifications.dispatchTaskNotifications).not.toHaveBeenCalled();
  });
});
