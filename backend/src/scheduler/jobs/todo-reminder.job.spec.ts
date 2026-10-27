import { TodoReminderJob } from './todo-reminder.job';
import { TodoMaintenanceJob } from './todo-maintenance.job';

const person = (id: number, patch: Record<string, unknown> = {}) => ({
  id,
  email: `user${id}@example.com`,
  deletedAt: null,
  todoReminderEmail: true,
  todoReminderPush: true,
  todoReminderCollective: true,
  ...patch,
});

describe('TodoReminderJob', () => {
  const todoModel = { findMany: jest.fn(), updateMany: jest.fn() };
  const settings = { getRawValue: jest.fn() };
  const email = { send: jest.fn() };
  const inbox = { notify: jest.fn() };
  const job = new TodoReminderJob(
    { client: { todo: todoModel } } as never,
    settings as never,
    email as never,
    inbox as never,
  );

  // 07:00 UTC is 09:00 in Paris: the default due moment of a todo due on the 20th.
  const dueMorning = new Date('2026-10-20T00:00:00Z');
  const dayBefore = new Date('2026-10-19T07:00:00Z');
  const base = {
    id: 1,
    title: 'Call <supplier>',
    dueDate: dueMorning,
    dueTime: null,
    remindBeforeMinutes: null,
    scope: 'PRIVATE',
    groupId: null,
    user: person(1),
    assignee: null,
    group: null,
  };
  const settingsOn = (overrides: Record<string, unknown> = {}) =>
    settings.getRawValue.mockImplementation((key: string) =>
      Promise.resolve(
        {
          'addons.todolist.enabled': true,
          'email.enabled': true,
          'scheduler.timezone': 'Europe/Paris',
          ...overrides,
        }[key],
      ),
    );

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.FRONTEND_URL = 'https://taskmaster.example.com/';
    settingsOn();
    email.send.mockResolvedValue(true);
    inbox.notify.mockResolvedValue(undefined);
    todoModel.findMany.mockResolvedValue([base]);
  });
  afterEach(() => {
    delete process.env.FRONTEND_URL;
  });

  it('puts the reminder in the bell, pops it up and emails it, then marks the todo', async () => {
    await job.execute(dayBefore);

    expect(inbox.notify).toHaveBeenCalledWith(
      1,
      {
        type: 'todo.reminder',
        title: 'Une tâche arrive à échéance',
        body: 'Call <supplier>',
        url: '/todos',
      },
      { push: true },
    );
    const mail = email.send.mock.calls[0][0];
    expect(mail.to).toBe('user1@example.com');
    expect(mail.html).toContain('Call &lt;supplier&gt;');
    expect(mail.html).toContain('20/10/2026 09:00');
    expect(mail.html).toContain('href="https://taskmaster.example.com/todos"');
    expect(mail.text).toContain('https://taskmaster.example.com/todos');
    expect(todoModel.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [1] } },
      data: { reminderSentAt: dayBefore },
    });
  });

  it('waits for the lead time the todo asked for', async () => {
    todoModel.findMany.mockResolvedValue([
      { ...base, dueTime: '14:30', remindBeforeMinutes: 60 },
    ]);

    // 14:30 Paris is 12:30 UTC; the reminder is due from 11:30 UTC.
    await job.execute(new Date('2026-10-20T11:29:00Z'));
    expect(inbox.notify).not.toHaveBeenCalled();
    expect(todoModel.updateMany).not.toHaveBeenCalled();

    await job.execute(new Date('2026-10-20T11:30:00Z'));
    expect(inbox.notify).toHaveBeenCalledTimes(1);
  });

  it('respects each person’s channels', async () => {
    todoModel.findMany.mockResolvedValue([
      {
        ...base,
        user: person(1, { todoReminderEmail: false, todoReminderPush: false }),
      },
    ]);

    await job.execute(dayBefore);

    expect(inbox.notify).toHaveBeenCalledWith(1, expect.anything(), {
      push: false,
    });
    expect(email.send).not.toHaveBeenCalled();
  });

  it('sends the bell and the pop-up even when email is off for the whole server', async () => {
    settingsOn({ 'email.enabled': false });

    await job.execute(dayBefore);

    expect(inbox.notify).toHaveBeenCalledTimes(1);
    expect(email.send).not.toHaveBeenCalled();
    expect(todoModel.updateMany).toHaveBeenCalled();
  });

  it('reminds only the person in charge of a collective todo', async () => {
    todoModel.findMany.mockResolvedValue([
      {
        ...base,
        scope: 'COLLECTIVE',
        groupId: 4,
        assignee: person(5),
        group: { members: [{ user: person(6) }, { user: person(7) }] },
      },
    ]);

    await job.execute(dayBefore);

    expect(inbox.notify.mock.calls.map(([id]) => id)).toEqual([5]);
    expect(email.send.mock.calls.map(([m]) => m.to)).toEqual([
      'user5@example.com',
    ]);
  });

  it('reminds the group, minus those who opted out of collective reminders and removed users', async () => {
    todoModel.findMany.mockResolvedValue([
      {
        ...base,
        scope: 'COLLECTIVE',
        groupId: 4,
        group: {
          members: [
            { user: person(6) },
            { user: person(7, { todoReminderCollective: false }) },
            { user: person(8, { deletedAt: new Date() }) },
          ],
        },
      },
    ]);

    await job.execute(dayBefore);

    expect(inbox.notify.mock.calls.map(([id]) => id)).toEqual([6]);
  });

  it('writes one digest per person for several todos', async () => {
    todoModel.findMany.mockResolvedValue([
      base,
      { ...base, id: 2, title: 'Second' },
    ]);

    await job.execute(dayBefore);

    expect(inbox.notify).toHaveBeenCalledTimes(1);
    expect(inbox.notify.mock.calls[0][1].title).toBe(
      '2 tâches arrivent à échéance',
    );
    expect(inbox.notify.mock.calls[0][1].body).toBe('Call <supplier> • Second');
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(todoModel.updateMany.mock.calls[0][0].where).toEqual({
      id: { in: [1, 2] },
    });
  });

  it('does not stop on a failed email', async () => {
    email.send.mockResolvedValue(false);

    await job.execute(dayBefore);

    expect(todoModel.updateMany).toHaveBeenCalled();
  });

  it('does nothing when the todolist is off', async () => {
    settingsOn({ 'addons.todolist.enabled': false });
    await job.execute(dayBefore);

    expect(todoModel.findMany).not.toHaveBeenCalled();
  });
});

describe('TodoMaintenanceJob', () => {
  it('clears old notifications', async () => {
    const inbox = { purgeOld: jest.fn().mockResolvedValue(5) };
    const job = new TodoMaintenanceJob(inbox as never);
    const now = new Date('2026-10-20T00:10:00Z');

    await job.execute(now);

    expect(inbox.purgeOld).toHaveBeenCalledWith(now);
  });
});
