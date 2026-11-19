import { mkdtempSync, rmSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { detectAttachmentType, TodosService, TodoActor } from './todos.service';

const JPEG = Buffer.from([255, 216, 255, 224, 0, 16]);
const PDF = Buffer.from('%PDF-1.7 minimal');

/** Channels picked in the todolist settings; push only unless a test says otherwise. */
function fixture(
  channels: { id: number; type: string }[] = [{ id: 1, type: 'PUSH' }],
) {
  const todo = {
    findUnique: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    delete: jest.fn(),
    deleteMany: jest.fn(),
  };
  const user = {
    findFirst: jest.fn().mockResolvedValue({ id: 3 }),
    findUnique: jest.fn().mockResolvedValue({
      username: 'marie',
      fullname: 'Marie Dupont',
      todoReminderPush: true,
    }),
    update: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
  };
  const comment = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
  };
  const attachment = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn(),
    delete: jest.fn(),
  };
  const client = {
    todo,
    user,
    todoComment: comment,
    todoCommentMention: { deleteMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    todoAttachment: attachment,
    group: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue({ id: 4 }),
      findUnique: jest.fn().mockResolvedValue({ name: 'Maintenance' }),
    },
    userGroupMembership: {
      findFirst: jest.fn().mockResolvedValue({ userId: 8 }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(1),
    },
    notificationChannel: {
      findMany: jest.fn().mockResolvedValue(channels),
    },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)({ todo })
      : Promise.all(arg as unknown[]),
  );
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  const email = { send: jest.fn().mockResolvedValue(true) };
  const settings = {
    getRawValue: jest.fn((key: string) =>
      Promise.resolve(
        key === 'addons.todolist.notify.channelIds'
          ? channels.map((c) => c.id)
          : '',
      ),
    ),
  };
  const broadcaster = { broadcast: jest.fn().mockResolvedValue(undefined) };
  const service = new TodosService(
    { client } as never,
    inbox as never,
    email as never,
    settings as never,
    broadcaster as never,
  );
  return {
    service,
    client,
    todo,
    user,
    comment,
    attachment,
    inbox,
    email,
    broadcaster,
  };
}

const collective = {
  id: 2,
  scope: 'COLLECTIVE',
  userId: 3,
  siteId: 1,
  groupId: 4,
  parentId: null,
  recurrence: 'NONE',
  spawnedNextAt: null,
  assigneeId: null,
  isCompleted: false,
  title: 'Inspect line',
  priority: 'NORMAL',
};

const actor = (patch: Partial<TodoActor> = {}): TodoActor => ({
  userId: 8,
  role: 'USER',
  siteId: 1,
  groupIds: [4],
  ...patch,
});

describe('TodosService summary and history', () => {
  it('counts what needs attention now', async () => {
    const { service, todo } = fixture();
    todo.count
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(9)
      .mockResolvedValueOnce(1);

    const result = await service.summary(
      8,
      [4],
      1,
      new Date('2026-10-20T15:00:00Z'),
    );

    expect(result).toEqual({ overdue: 2, dueToday: 3, open: 9, mine: 1 });
    const overdueWhere = todo.count.mock.calls[0][0].where.AND[1];
    expect(overdueWhere.dueDate.lt).toEqual(new Date('2026-10-20T00:00:00Z'));
    const todayWhere = todo.count.mock.calls[1][0].where.AND[1];
    expect(todayWhere.dueDate).toEqual({
      gte: new Date('2026-10-20T00:00:00Z'),
      lt: new Date('2026-10-21T00:00:00Z'),
    });
  });

  it('pages the history with a cursor', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValue([{ id: 9 }, { id: 8 }, { id: 7 }]);

    const page = await service.history(8, [4], 1, 'COLLECTIVE', { take: 2 });

    expect(page.items.map((t) => t.id)).toEqual([9, 8]);
    expect(page.nextCursor).toBe(8);
    expect(todo.findMany.mock.calls[0][0].take).toBe(3);
  });

  it('reports the end of the history and searches by title', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValue([{ id: 1 }]);

    const page = await service.history(8, [4], 1, undefined, {
      search: ' boiler ',
      cursor: 5,
    });

    expect(page.nextCursor).toBeNull();
    const call = todo.findMany.mock.calls[0][0];
    expect(call.cursor).toEqual({ id: 5 });
    expect(call.skip).toBe(1);
    expect(call.where.AND).toContainEqual({
      title: { contains: 'boiler', mode: 'insensitive' },
    });
  });
});

describe('TodosService assignment', () => {
  it('assigns a new collective todo and tells the assignee', async () => {
    const { service, todo, inbox } = fixture();
    todo.create.mockResolvedValue({ ...collective, assigneeId: 3, userId: 1 });

    await service.create(
      { title: 'Inspect line', scope: 'COLLECTIVE', assigneeId: 3 } as never,
      1,
      1,
      'MANAGER',
    );

    expect(todo.create.mock.calls[0][0].data.assigneeId).toBe(3);
    expect(inbox.notify).toHaveBeenCalledWith(
      3,
      expect.objectContaining({
        type: 'todo.assigned',
        url: '/todos?todoId=2',
      }),
      { push: true },
    );
  });

  it('sends no pop-up, email or team message when the admin picked no channel', async () => {
    const { service, todo, inbox, email, broadcaster } = fixture([]);
    todo.create.mockResolvedValue({ ...collective, assigneeId: 3, userId: 1 });

    await service.create(
      { title: 'Inspect line', scope: 'COLLECTIVE', assigneeId: 3 } as never,
      1,
      1,
      'MANAGER',
    );

    expect(inbox.notify).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: 'todo.assigned' }),
      { push: false },
    );
    expect(email.send).not.toHaveBeenCalled();
    expect(broadcaster.broadcast).not.toHaveBeenCalled();
  });

  it('emails the assignee and posts on the team channels the admin picked', async () => {
    const { service, todo, user, email, broadcaster } = fixture([
      { id: 2, type: 'EMAIL' },
      { id: 5, type: 'SLACK' },
    ]);
    user.findUnique.mockResolvedValue({
      username: 'marie',
      fullname: 'Marie Dupont',
      email: 'marie@example.com',
      todoReminderEmail: true,
      todoReminderPush: true,
    });
    todo.create.mockResolvedValue({ ...collective, assigneeId: 3, userId: 1 });

    await service.create(
      { title: 'Inspect line', scope: 'COLLECTIVE', assigneeId: 3 } as never,
      1,
      1,
      'MANAGER',
    );

    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'marie@example.com',
        subject: expect.stringContaining('Une tâche vous a été confiée'),
      }),
    );
    expect(broadcaster.broadcast).toHaveBeenCalledWith(
      [5],
      'Nouvelle tâche collective',
      expect.arrayContaining([{ label: 'Tâche', value: 'Inspect line' }]),
    );
  });

  it('emails the assignee whatever their "By email" reminder choice', async () => {
    const { service, todo, user, email } = fixture([{ id: 2, type: 'EMAIL' }]);
    user.findUnique.mockResolvedValue({
      username: 'marie',
      fullname: 'Marie Dupont',
      email: 'marie@example.com',
      todoReminderEmail: false,
      todoReminderPush: true,
    });
    todo.create.mockResolvedValue({ ...collective, assigneeId: 3, userId: 1 });

    await service.create(
      { title: 'Inspect line', scope: 'COLLECTIVE', assigneeId: 3 } as never,
      1,
      1,
      'MANAGER',
    );

    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('tells the members of the group of an unassigned collective todo, not its creator', async () => {
    const { service, client, todo, inbox } = fixture();
    todo.create.mockResolvedValue({ ...collective, userId: 1 });
    client.userGroupMembership.findMany.mockResolvedValue([
      { userId: 8 },
      { userId: 9 },
    ]);

    await service.create(
      { title: 'Inspect line', scope: 'COLLECTIVE', groupId: 4 } as never,
      1,
      1,
      'MANAGER',
    );

    const where = client.userGroupMembership.findMany.mock.calls[0][0].where;
    expect(where.userId).toEqual({ not: 1 });
    expect(inbox.notify.mock.calls.map(([id]) => id)).toEqual([8, 9]);
    expect(inbox.notify.mock.calls[0][1].type).toBe('todo.created');
  });

  it('does not tell someone they assigned themselves', async () => {
    const { service, todo, inbox } = fixture();
    todo.create.mockResolvedValue({ ...collective, assigneeId: 1, userId: 1 });

    await service.create(
      { title: 'Mine', scope: 'COLLECTIVE', assigneeId: 1 } as never,
      1,
      1,
      'MANAGER',
    );

    expect(inbox.notify).not.toHaveBeenCalled();
  });

  it('refuses an assignee on a private todo', async () => {
    const { service } = fixture();

    await expect(
      service.create(
        { title: 'x', scope: 'PRIVATE', assigneeId: 3 } as never,
        1,
        1,
        'USER',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses someone who is not an active member of the site', async () => {
    const { service, user } = fixture();
    user.findFirst.mockResolvedValue(null);

    await expect(
      service.create(
        { title: 'x', scope: 'COLLECTIVE', assigneeId: 99 } as never,
        1,
        1,
        'MANAGER',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets a group member take an unassigned todo', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    todo.update.mockResolvedValue({ ...collective, assigneeId: 8 });

    await service.update(2, { assigneeId: 8 }, 8, 'USER', 1);

    expect(todo.update.mock.calls[0][0].data.assigneeId).toBe(8);
  });

  it('lets the assignee let go of a todo', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 8 });
    todo.update.mockResolvedValue({ ...collective, assigneeId: null });

    await service.update(2, { assigneeId: null }, 8, 'USER', 1);

    expect(todo.update.mock.calls[0][0].data.assigneeId).toBeNull();
  });

  it('refuses a member taking over a todo somebody else holds, or handing it out', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });

    await expect(
      service.update(2, { assigneeId: 8 }, 8, 'USER', 1),
    ).rejects.toThrow(ForbiddenException);

    todo.findUnique.mockResolvedValue(collective);
    await expect(
      service.update(2, { assigneeId: 3 }, 8, 'USER', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('tells every member of the team when an existing todo is handed to it', async () => {
    const { service, client, todo, inbox } = fixture();
    todo.findUnique.mockResolvedValue({
      ...collective,
      groupId: null,
      assigneeId: 5,
    });
    todo.update.mockResolvedValue({
      ...collective,
      groupId: 4,
      assigneeId: null,
    });
    client.userGroupMembership.findMany.mockResolvedValue([
      { userId: 8 },
      { userId: 9 },
    ]);

    await service.update(2, { groupId: 4, assigneeId: null }, 1, 'MANAGER', 1);

    expect(inbox.notify.mock.calls.map(([id]) => id)).toEqual([8, 9]);
    expect(inbox.notify.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        type: 'todo.assigned_team',
        title: 'Tâche confiée à votre équipe',
      }),
    );
  });

  it('stays quiet when the team of a todo does not change', async () => {
    const { service, todo, inbox } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    todo.update.mockResolvedValue({ ...collective, title: 'Renamed' });

    await service.update(2, { title: 'Renamed' }, 1, 'MANAGER', 1);

    expect(inbox.notify).not.toHaveBeenCalled();
  });

  describe('a team lead handing todos out', () => {
    const asLead = (
      client: ReturnType<typeof fixture>['client'],
      ids: number[],
    ) =>
      client.userGroupMembership.findMany.mockImplementation(
        (args: { where?: { isLead?: boolean } }) =>
          Promise.resolve(
            args.where?.isLead ? ids.map((groupId) => ({ groupId })) : [],
          ),
      );

    it('hands a todo of the team to one of its members', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      todo.findUnique.mockResolvedValue(collective);
      todo.update.mockResolvedValue({ ...collective, assigneeId: 9 });

      await service.update(2, { assigneeId: 9 }, 8, 'USER', 1);

      expect(todo.update.mock.calls[0][0].data.assigneeId).toBe(9);
    });

    it('redispatches a todo assigned to the lead in person, even without a team', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      todo.findUnique.mockResolvedValue({
        ...collective,
        groupId: null,
        assigneeId: 8,
      });
      todo.update.mockResolvedValue({
        ...collective,
        groupId: null,
        assigneeId: 9,
      });

      await service.update(2, { assigneeId: 9 }, 8, 'USER', 1);

      const check = client.userGroupMembership.count.mock.calls[0][0].where;
      expect(check).toEqual({ userId: 9, groupId: { in: [4] } });
      expect(todo.update).toHaveBeenCalled();
    });

    it('can hand a todo back to the team', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      todo.findUnique.mockResolvedValue({
        ...collective,
        groupId: null,
        assigneeId: 8,
      });
      todo.update.mockResolvedValue({ ...collective, assigneeId: null });

      await service.update(2, { groupId: 4, assigneeId: null }, 8, 'USER', 1);

      expect(todo.update).toHaveBeenCalled();
    });

    it('refuses someone who is not a lead', async () => {
      const { service, todo } = fixture();
      todo.findUnique.mockResolvedValue(collective);

      await expect(
        service.update(2, { assigneeId: 9 }, 8, 'USER', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses a todo that belongs to another team', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      todo.findUnique.mockResolvedValue({
        ...collective,
        groupId: 7,
        assigneeId: 5,
      });

      await expect(
        service.update(2, { assigneeId: 9 }, 8, 'USER', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses someone who is not in the team', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      client.userGroupMembership.count.mockResolvedValue(0);
      todo.findUnique.mockResolvedValue(collective);

      await expect(
        service.update(2, { assigneeId: 99 }, 8, 'USER', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuses any other change, such as the title or a move to another team', async () => {
      const { service, client, todo } = fixture();
      asLead(client, [4]);
      todo.findUnique.mockResolvedValue(collective);

      await expect(
        service.update(2, { title: 'Renamed' }, 8, 'USER', 1),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(2, { groupId: 7 }, 8, 'USER', 1),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lists the teams a person leads with their members', async () => {
      const { service, client } = fixture();
      client.userGroupMembership.findMany.mockResolvedValue([
        {
          group: {
            id: 4,
            name: 'Maintenance',
            members: [
              { user: { id: 8, username: 'marie', fullname: 'Marie Dupont' } },
              { user: { id: 9, username: 'paul', fullname: null } },
            ],
          },
        },
      ]);

      const targets = await service.dispatchTargets(8);

      const select =
        client.userGroupMembership.findMany.mock.calls[0][0].select;
      expect(select.group.select.members.select.user.select.avatarUrl).toBe(
        true,
      );
      expect(targets).toEqual([
        {
          id: 4,
          name: 'Maintenance',
          memberCount: 2,
          members: [
            { id: 8, username: 'marie', fullname: 'Marie Dupont' },
            { id: 9, username: 'paul', fullname: null },
          ],
        },
      ]);
    });
  });

  it('lets a manager reassign and tells the new assignee', async () => {
    const { service, todo, inbox } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    todo.update.mockResolvedValue({ ...collective, assigneeId: 3 });

    await service.update(2, { assigneeId: 3 }, 1, 'MANAGER', 1);

    expect(inbox.notify).toHaveBeenCalledWith(
      3,
      expect.objectContaining({ type: 'todo.assigned' }),
      { push: true },
    );
  });

  it('tells the creator and the assignee, not the person who ticked, when a todo is done', async () => {
    const { service, todo, inbox } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    todo.update.mockResolvedValue({
      ...collective,
      assigneeId: 5,
      isCompleted: true,
    });

    await service.update(2, { isCompleted: true }, 8, 'USER', 1);

    const told = inbox.notify.mock.calls.map(([id]) => id).sort();
    expect(told).toEqual([3, 5]);
    expect(inbox.notify.mock.calls[0][1].type).toBe('todo.completed');
  });
});

describe('TodosService schedule fields', () => {
  it('re-arms the reminder when the time or the lead time changes', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue({
      ...collective,
      scope: 'PRIVATE',
      userId: 7,
    });
    todo.update.mockResolvedValue({ ...collective });

    await service.update(2, { dueTime: '14:30' }, 7, 'USER', 1);
    await service.update(2, { remindBeforeMinutes: 60 }, 7, 'USER', 1);

    for (const [call] of todo.update.mock.calls) {
      expect(call.data.reminderSentAt).toBeNull();
    }
    expect(todo.update.mock.calls[0][0].data.dueTime).toBe('14:30');
    expect(todo.update.mock.calls[1][0].data.remindBeforeMinutes).toBe(60);
  });
});

describe('TodosService.reorder', () => {
  const rows = (priority = 'NORMAL', scope = 'PRIVATE', userId = 7) => [
    { id: 1, scope, userId, priority },
    { id: 2, scope, userId, priority },
  ];

  it('numbers the todos in the given order', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValue(rows());
    todo.update.mockImplementation((args: unknown) => args);

    await service.reorder([2, 1], 7, 'USER', 1);

    expect(
      todo.update.mock.calls.map(([a]) => [a.where.id, a.data.position]),
    ).toEqual([
      [2, 1],
      [1, 2],
    ]);
  });

  it("refuses other people's private todos and collective ones for members", async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValue(rows('NORMAL', 'PRIVATE', 99));
    await expect(service.reorder([1, 2], 7, 'USER', 1)).rejects.toThrow(
      ForbiddenException,
    );

    todo.findMany.mockResolvedValue(rows('NORMAL', 'COLLECTIVE', 3));
    await expect(service.reorder([1, 2], 7, 'USER', 1)).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.reorder([1, 2], 3, 'MANAGER', 1)).resolves.toEqual({
      success: true,
    });
  });

  it('refuses mixed priorities, duplicates and unknown ids', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValue([
      { id: 1, scope: 'PRIVATE', userId: 7, priority: 'LOW' },
      { id: 2, scope: 'PRIVATE', userId: 7, priority: 'HIGH' },
    ]);
    await expect(service.reorder([1, 2], 7, 'USER', 1)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.reorder([1, 1], 7, 'USER', 1)).rejects.toThrow(
      BadRequestException,
    );

    todo.findMany.mockResolvedValue([]);
    await expect(service.reorder([5, 6], 7, 'USER', 1)).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('TodosService comments', () => {
  it('hides a todo the person cannot see', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, groupId: 9 });

    await expect(service.listComments(2, actor())).rejects.toThrow(
      NotFoundException,
    );
    todo.findUnique.mockResolvedValue({
      ...collective,
      scope: 'PRIVATE',
      userId: 99,
    });
    await expect(service.listComments(2, actor())).rejects.toThrow(
      NotFoundException,
    );
  });

  const saved = (extra: Record<string, unknown> = {}) => ({
    id: 11,
    body: 'Done soon',
    userId: 8,
    parentId: null,
    deletedAt: null,
    mentions: [],
    user: { id: 8, username: 'jean', fullname: 'Jean Martin' },
    ...extra,
  });
  const person = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    username: `u${id}`,
    fullname: null,
    avatarUrl: null,
    email: `u${id}@x.io`,
    todoReminderEmail: true,
    ...extra,
  });

  it('tells the assignee only: not the creator, not the author, not the team', async () => {
    const { service, todo, comment, user, inbox } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    comment.create.mockResolvedValue(saved());
    user.findMany.mockResolvedValue([person(5)]);

    await service.addComment(2, { body: '  Done soon  ' }, actor());

    const data = comment.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ todoId: 2, userId: 8, body: 'Done soon' });
    // Only the assignee (5): the creator (3) and the whole team are not told.
    expect(user.findMany.mock.calls[0][0].where.id).toEqual({ in: [5] });
    expect(inbox.notify.mock.calls.map(([id]) => id)).toEqual([5]);
    expect(inbox.notify.mock.calls[0][1].url).toBe(
      '/todos?todoId=2&commentId=11',
    );
  });

  it('tells mentioned people and team members once, with the mention wording', async () => {
    const { service, todo, comment, user, inbox, client, email } = fixture([
      { id: 1, type: 'PUSH' },
      { id: 2, type: 'EMAIL' },
    ]);
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    comment.create.mockResolvedValue(saved());
    // mention validation: person 6 and team 4 are allowed
    user.findMany
      .mockResolvedValueOnce([person(6)])
      .mockResolvedValueOnce([person(5), person(6), person(7)]);
    client.group.findMany.mockResolvedValue([{ id: 4, name: 'Maintenance' }]);
    // team 4 = members 6, 7 and the author 8
    client.userGroupMembership.findMany.mockResolvedValue([
      { userId: 6 },
      { userId: 7 },
      { userId: 8 },
    ]);
    user.findUnique.mockResolvedValue({
      username: 'x',
      fullname: 'X',
      email: 'x@x.io',
      todoReminderPush: true,
    });

    await service.addComment(
      2,
      { body: 'Hi', mentions: ['user:6', 'group:4', 'user:6'] },
      actor(),
    );

    const told = inbox.notify.mock.calls.map(([id, n]) => [id, n.type]);
    expect(told.sort()).toEqual([
      [5, 'todo.comment'],
      [6, 'todo.mention'],
      [7, 'todo.mention'],
    ]);
    expect(email.send).toHaveBeenCalledTimes(3);
    expect(comment.create.mock.calls[0][0].data.mentions.create).toEqual([
      { userId: 6 },
      { groupId: 4 },
    ]);
  });

  it('refuses a mention of someone who cannot see the todo', async () => {
    const { service, todo, user, comment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    user.findMany.mockResolvedValue([]); // not allowed

    await expect(
      service.addComment(2, { body: 'Hi', mentions: ['user:99'] }, actor()),
    ).rejects.toThrow(BadRequestException);
    expect(comment.create).not.toHaveBeenCalled();
    await expect(
      service.addComment(2, { body: 'Hi', mentions: ['bad'] }, actor()),
    ).rejects.toThrow(BadRequestException);
  });

  it('keeps the comment when a notification fails', async () => {
    const { service, todo, comment, user, inbox } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    comment.create.mockResolvedValue(saved());
    user.findMany.mockResolvedValue([person(5)]);
    inbox.notify.mockRejectedValue(new Error('down'));

    await expect(
      service.addComment(2, { body: 'Hi' }, actor()),
    ).resolves.toMatchObject({ id: 11 });
  });

  it('keeps an answer to a reply in the same thread and refuses a foreign parent', async () => {
    const { service, todo, comment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    comment.create.mockResolvedValue(saved({ parentId: 7 }));
    comment.findFirst.mockResolvedValueOnce({ id: 9, parentId: 7 });

    await service.addComment(2, { body: 'Re', parentId: 9 }, actor());
    expect(comment.create.mock.calls[0][0].data.parentId).toBe(7);

    comment.findFirst.mockResolvedValueOnce(null); // other todo / unknown
    await expect(
      service.addComment(2, { body: 'Re', parentId: 500 }, actor()),
    ).rejects.toThrow(NotFoundException);
  });

  it('offers only people and teams who can already see the todo', async () => {
    const { service, todo, user, client } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    user.findMany.mockResolvedValue([person(8), person(6)]);
    client.group.findMany.mockResolvedValue([{ id: 4, name: 'Maintenance' }]);

    const result = await service.mentionTargets(2, actor());

    expect(result.users.map((u) => u.id)).toEqual([6]); // not oneself
    expect(result.groups).toEqual([{ id: 4, name: 'Maintenance' }]);
    expect(user.findMany.mock.calls[0][0].where.groupMemberships).toEqual({
      some: { groupId: 4 },
    });
    expect(user.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });

  it('offers nobody on a private todo', async () => {
    const { service, todo, user, client } = fixture();
    todo.findUnique.mockResolvedValue({
      ...collective,
      scope: 'PRIVATE',
      userId: 8,
    });
    user.findMany.mockResolvedValue([person(8)]);

    const result = await service.mentionTargets(2, actor());

    expect(result).toEqual({ users: [], groups: [] });
    expect(client.group.findMany).not.toHaveBeenCalled();
  });

  it('marks as read only up to a comment of this todo, never backwards', async () => {
    const { service, todo, comment, client } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    comment.findFirst.mockResolvedValue({ id: 40 });

    await expect(service.markCommentsRead(2, 55, actor())).resolves.toEqual({
      lastReadCommentId: 40,
    });
    expect(comment.findFirst.mock.calls[0][0].where).toEqual({
      todoId: 2,
      id: { lte: 55 },
    });
    expect(String(client.$executeRaw.mock.calls[0][0].join(' '))).toContain(
      'GREATEST',
    );

    comment.findFirst.mockResolvedValue(null);
    client.$executeRaw.mockClear();
    await service.markCommentsRead(2, 5, actor());
    expect(client.$executeRaw).not.toHaveBeenCalled();
  });

  it('flags unread comments of other people for a whole list in one query', async () => {
    const { service, todo, client } = fixture();
    todo.findMany.mockResolvedValue([{ id: 2 }, { id: 3 }]);
    client.$queryRaw.mockResolvedValue([{ todo_id: 3, unread: 2 }]);

    const rows = await service.findAll(8, [4], 1);

    expect(client.$queryRaw).toHaveBeenCalledTimes(1);
    expect(rows.map((r) => r.unreadComments)).toEqual([0, 2]);
  });

  it('narrows the summary to my own and assigned todos for the personal scope', async () => {
    const { service, todo } = fixture();
    await service.summary(8, [4], 1, new Date('2026-10-20T15:00:00Z'), {
      personal: true,
    });
    const open = todo.count.mock.calls[2][0].where;
    expect(open.AND[2]).toEqual({
      OR: [{ scope: 'PRIVATE', userId: 8 }, { assigneeId: 8 }],
    });
  });

  it('refuses an empty comment', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue(collective);

    await expect(
      service.addComment(2, { body: '   ' }, actor()),
    ).rejects.toThrow(BadRequestException);
  });

  it('lets authors and managers delete, nobody else', async () => {
    const { service, todo, comment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    comment.findFirst.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.deleteComment(2, 1, actor())).rejects.toThrow(
      ForbiddenException,
    );
    await expect(
      service.deleteComment(2, 1, actor({ role: 'MANAGER' })),
    ).resolves.toEqual({ success: true });
    comment.findFirst.mockResolvedValue({ id: 1, userId: 8, parentId: null });
    await expect(service.deleteComment(2, 1, actor())).resolves.toEqual({
      success: true,
    });
    expect(comment.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it('keeps an empty slot for a deleted root that still has replies', async () => {
    const { service, todo, comment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    comment.findFirst.mockResolvedValue({ id: 1, userId: 8, parentId: null });
    comment.count.mockResolvedValue(2);

    await service.deleteComment(2, 1, actor());

    expect(comment.delete).not.toHaveBeenCalled();
    expect(comment.update.mock.calls[0][0].data).toMatchObject({ body: '' });
    expect(comment.update.mock.calls[0][0].data.deletedAt).toBeInstanceOf(Date);
  });
});

describe('detectAttachmentType', () => {
  it('recognises images and PDFs by their first bytes', () => {
    expect(detectAttachmentType(JPEG)).toBe('image/jpeg');
    expect(
      detectAttachmentType(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0])),
    ).toBe('image/png');
    expect(detectAttachmentType(Buffer.from('RIFF....WEBPVP8 '))).toBe(
      'image/webp',
    );
    expect(detectAttachmentType(PDF)).toBe('application/pdf');
  });

  it('refuses anything else, whatever its name says', () => {
    expect(detectAttachmentType(Buffer.from('MZ\x90\x00 an executable'))).toBe(
      undefined,
    );
    expect(detectAttachmentType(Buffer.from('<script>alert(1)</script>'))).toBe(
      undefined,
    );
  });
});

describe('TodosService attachments', () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'todo-att-'));
    process.env.TASKMASTER_DATA_DIR = dataDir;
  });
  afterEach(() => {
    delete process.env.TASKMASTER_DATA_DIR;
    rmSync(dataDir, { recursive: true, force: true });
  });

  const stored = () =>
    readdirSync(join(dataDir, 'storage', 'todo-attachments'));

  it('stores the file under its id and records a clean name', async () => {
    const { service, todo, attachment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    attachment.create.mockImplementation(({ data }) => data);

    const saved = await service.addAttachment(
      2,
      { buffer: PDF, originalname: '..\\..\\etc/rapport "final".pdf' },
      actor(),
    );

    expect(saved.mimeType).toBe('application/pdf');
    expect(saved.filename).toBe('rapport _final_.pdf');
    expect(stored()).toEqual([saved.id]);
  });

  it('refuses a disguised executable, an oversized file and a 11th attachment', async () => {
    const { service, todo, attachment } = fixture();
    todo.findUnique.mockResolvedValue(collective);

    await expect(
      service.addAttachment(
        2,
        { buffer: Buffer.from('MZ fake'), originalname: 'photo.png' },
        actor(),
      ),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.addAttachment(
        2,
        {
          buffer: Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024)]),
          originalname: 'big.jpg',
        },
        actor(),
      ),
    ).rejects.toThrow(BadRequestException);

    attachment.count.mockResolvedValue(10);
    await expect(
      service.addAttachment(
        2,
        { buffer: JPEG, originalname: 'a.jpg' },
        actor(),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('removes the file when the row cannot be saved', async () => {
    const { service, todo, attachment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    attachment.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.addAttachment(
        2,
        { buffer: JPEG, originalname: 'a.jpg' },
        actor(),
      ),
    ).rejects.toThrow('db down');
    expect(stored()).toEqual([]);
  });

  it('deletes the row and the file, for the uploader or a manager only', async () => {
    const { service, todo, attachment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    attachment.create.mockImplementation(({ data }) => data);
    const saved = await service.addAttachment(
      2,
      { buffer: JPEG, originalname: 'a.jpg' },
      actor(),
    );
    attachment.findFirst.mockResolvedValue({ id: saved.id, uploaderId: 5 });

    await expect(
      service.deleteAttachment(2, saved.id, actor()),
    ).rejects.toThrow(ForbiddenException);
    expect(stored()).toEqual([saved.id]);

    await service.deleteAttachment(2, saved.id, actor({ role: 'MANAGER' }));
    expect(attachment.delete).toHaveBeenCalledWith({ where: { id: saved.id } });
    expect(stored()).toEqual([]);
  });

  it('serves a stored file back, and says so when it is gone', async () => {
    const { service, todo, attachment } = fixture();
    todo.findUnique.mockResolvedValue(collective);
    attachment.create.mockImplementation(({ data }) => data);
    const saved = await service.addAttachment(
      2,
      { buffer: PDF, originalname: 'a.pdf' },
      actor(),
    );
    attachment.findFirst.mockResolvedValue({
      id: saved.id,
      filename: 'a.pdf',
      mimeType: 'application/pdf',
      size: PDF.length,
    });

    const file = await service.downloadAttachment(2, saved.id, actor());
    expect(file.filename).toBe('a.pdf');
    file.stream.destroy();

    attachment.findFirst.mockResolvedValue({
      id: 'missing-on-disk',
      filename: 'x',
      mimeType: 'application/pdf',
      size: 1,
    });
    await expect(
      service.downloadAttachment(2, 'missing-on-disk', actor()),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('TodosService preferences', () => {
  it('reads defaults and saves only what changed', async () => {
    const { service, user } = fixture();
    user.findUnique.mockResolvedValue({
      todoReminderEmail: true,
      todoReminderPush: false,
      todoReminderCollective: true,
    });

    const prefs = await service.updatePreferences(8, { push: false });

    expect(user.update).toHaveBeenCalledWith({
      where: { id: 8 },
      data: {
        todoReminderEmail: undefined,
        todoReminderPush: false,
        todoReminderCollective: undefined,
      },
    });
    expect(prefs).toEqual({ email: true, push: false, collective: true });
  });
});
