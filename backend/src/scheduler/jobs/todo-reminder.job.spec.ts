import { TodoReminderJob } from './todo-reminder.job';

describe('TodoReminderJob', () => {
  const todoModel = { findMany: jest.fn(), updateMany: jest.fn() };
  const settings = { getRawValue: jest.fn() };
  const email = { send: jest.fn() };
  const job = new TodoReminderJob(
    { client: { todo: todoModel } } as never,
    settings as never,
    email as never,
  );

  const owner = { email: 'a@example.com', deletedAt: null };
  const colleague = { email: 'b@example.com', deletedAt: null };
  const gone = { email: 'c@example.com', deletedAt: new Date() };
  const due = new Date('2026-10-20');

  const privateTodo = {
    id: 1,
    title: 'Call <supplier>',
    dueDate: due,
    scope: 'PRIVATE',
    groupId: null,
    user: owner,
    group: null,
  };
  const collectiveTodo = {
    id: 2,
    title: 'Inspect line',
    dueDate: due,
    scope: 'COLLECTIVE',
    groupId: 4,
    user: owner,
    group: {
      members: [{ user: owner }, { user: colleague }, { user: gone }],
    },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    settings.getRawValue.mockResolvedValue(true);
    email.send.mockResolvedValue(true);
    todoModel.findMany.mockResolvedValue([privateTodo, collectiveTodo]);
  });

  it('sends one digest per person, skipping removed users', async () => {
    await job.execute();

    const recipients = email.send.mock.calls.map(([m]) => m.to).sort();
    expect(recipients).toEqual(['a@example.com', 'b@example.com']);
    const toOwner = email.send.mock.calls.find(
      ([m]) => m.to === 'a@example.com',
    )[0];
    expect(toOwner.subject).toContain('2 tâches');
    expect(toOwner.html).toContain('Call &lt;supplier&gt;');
    expect(todoModel.updateMany).toHaveBeenCalledWith({
      where: { id: { in: expect.arrayContaining([1, 2]) } },
      data: { reminderSentAt: expect.any(Date) },
    });
  });

  it('leaves todos unmarked when the email failed, so they are retried', async () => {
    email.send.mockResolvedValue(false);

    await job.execute();

    expect(todoModel.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing when reminders are off', async () => {
    settings.getRawValue.mockImplementation((key: string) =>
      Promise.resolve(key !== 'addons.todolist.reminders.enabled'),
    );

    await job.execute();

    expect(todoModel.findMany).not.toHaveBeenCalled();
  });
});
