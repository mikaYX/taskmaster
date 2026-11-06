import { format } from 'date-fns';
import { ReminderNotificationJob } from './reminder-notification.job';

const MINUTE = 60_000;
// 16:50 UTC: the current run covers offsets ending at the 16:45 tick.
const NOW = new Date('2026-11-05T16:50:00.000Z');
const TICK = new Date('2026-11-05T16:45:00.000Z').getTime();

describe('ReminderNotificationJob', () => {
  const client = {
    status: { findMany: jest.fn(), findFirst: jest.fn(), count: jest.fn() },
    taskNotification: { findMany: jest.fn() },
    site: { findMany: jest.fn() },
  };
  const settings = { getRawValue: jest.fn() };
  const notifications = { dispatchTaskNotifications: jest.fn() };
  const instances = { computeInstances: jest.fn() };
  const jobLock = { withLock: jest.fn() };
  const job = new ReminderNotificationJob(
    { client } as never,
    settings as never,
    notifications as never,
    instances as never,
    jobLock as never,
  );

  const row = (id: number, taskId: number, offset = 60, task = {}) => ({
    id,
    taskId,
    reminderOffsetMinutes: offset,
    task: { id: taskId, siteId: null, rrule: 'FREQ=DAILY', ...task },
  });
  const occurrence = (deadline: number, date = new Date(deadline)) => ({
    date,
    periodEnd: new Date(deadline),
  });

  beforeEach(() => {
    jest.resetAllMocks();
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate'] });
    settings.getRawValue.mockResolvedValue(undefined);
    notifications.dispatchTaskNotifications.mockResolvedValue(undefined);
    client.status.findMany.mockResolvedValue([]);
    client.taskNotification.findMany.mockResolvedValue([]);
    client.site.findMany.mockResolvedValue([]);
    instances.computeInstances.mockReturnValue([]);
    jobLock.withLock.mockImplementation(
      async (_name: string, run: () => Promise<void>) => {
        await run();
        return { success: true, message: '' };
      },
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('runs under the job lock', async () => {
    jobLock.withLock.mockResolvedValue({ success: false, message: 'locked' });

    await job.execute();

    expect(jobLock.withLock).toHaveBeenCalledWith(
      'email-reminders',
      expect.any(Function),
    );
    expect(client.taskNotification.findMany).not.toHaveBeenCalled();
  });

  it('only loads rows asking for a reminder on an enabled channel and a live task', async () => {
    await job.execute();

    expect(client.taskNotification.findMany.mock.calls[0][0].where).toEqual({
      notifyOnReminder: true,
      channel: { enabled: true },
      task: { deletedAt: null },
    });
    expect(instances.computeInstances).not.toHaveBeenCalled();
  });

  it('targets the one notification row whose delay matches the deadline', async () => {
    const deadline = TICK + 60 * MINUTE;
    client.taskNotification.findMany.mockResolvedValue([
      row(10, 1, 60),
      row(11, 1, 180),
    ]);
    instances.computeInstances.mockReturnValue([occurrence(deadline)]);

    await job.execute();

    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(1);
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledWith(
      1,
      'REMINDER',
      {
        notificationId: 10,
        instanceDate: format(new Date(deadline), 'yyyy-MM-dd'),
        deadline: new Date(deadline),
      },
    );
  });

  it('never sends the same deadline from two runs', async () => {
    client.taskNotification.findMany.mockResolvedValue([row(10, 1, 60)]);
    // The upper bound of this run is excluded from the next one.
    instances.computeInstances.mockReturnValue([
      occurrence(TICK + 60 * MINUTE),
    ]);
    await job.execute();
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(1);

    notifications.dispatchTaskNotifications.mockClear();
    jest.setSystemTime(new Date(NOW.getTime() + 15 * MINUTE));
    await job.execute();
    expect(notifications.dispatchTaskNotifications).not.toHaveBeenCalled();
  });

  it('leaves no gap between two runs', async () => {
    client.taskNotification.findMany.mockResolvedValue([row(10, 1, 60)]);
    instances.computeInstances.mockReturnValue([
      occurrence(TICK + 60 * MINUTE + 1),
    ]);

    await job.execute();
    expect(notifications.dispatchTaskNotifications).not.toHaveBeenCalled();

    jest.setSystemTime(new Date(NOW.getTime() + 15 * MINUTE));
    await job.execute();
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(1);
  });

  it('reminds an occurrence that started long before its deadline', async () => {
    client.taskNotification.findMany.mockResolvedValue([row(10, 1, 60)]);
    const monthStart = new Date('2026-11-01T08:00:00.000Z');
    instances.computeInstances.mockReturnValue([
      occurrence(TICK + 60 * MINUTE, monthStart),
    ]);

    await job.execute();

    const [, rangeStart] = instances.computeInstances.mock.calls[0];
    expect(rangeStart.getTime()).toBeLessThan(monthStart.getTime());
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(1);
  });

  it('skips closed occurrences but not running ones', async () => {
    const date = new Date(TICK + 60 * MINUTE);
    client.taskNotification.findMany.mockResolvedValue([
      row(10, 1, 60),
      row(20, 2, 60),
    ]);
    instances.computeInstances.mockReturnValue([occurrence(date.getTime())]);
    client.status.findMany.mockResolvedValue([
      { taskId: 2, instanceDate: date },
    ]);

    await job.execute();

    expect(client.status.findMany.mock.calls[0][0].where.status).toEqual({
      not: 'RUNNING',
    });
    expect(notifications.dispatchTaskNotifications).toHaveBeenCalledTimes(1);
    expect(notifications.dispatchTaskNotifications.mock.calls[0][0]).toBe(1);
  });

  it('does not remind a deadline outside the window', async () => {
    client.taskNotification.findMany.mockResolvedValue([row(10, 1, 60)]);
    instances.computeInstances.mockReturnValue([
      occurrence(TICK + 5 * 60 * MINUTE),
    ]);

    await job.execute();

    expect(notifications.dispatchTaskNotifications).not.toHaveBeenCalled();
  });

  it('gives a from-completion task its context when the feature is on', async () => {
    settings.getRawValue.mockImplementation((key: string) =>
      Promise.resolve(key === 'FROM_COMPLETION_ENABLED' ? true : undefined),
    );
    client.status.findFirst.mockResolvedValue(null);
    client.status.count.mockResolvedValue(0);
    client.taskNotification.findMany.mockResolvedValue([
      row(10, 1, 60, { recurrenceMode: 'FROM_COMPLETION' }),
    ]);

    await job.execute();

    expect(instances.computeInstances.mock.calls[0][4]).toEqual({
      lastTerminalDate: null,
      hasRunningInstance: false,
    });
  });
});
