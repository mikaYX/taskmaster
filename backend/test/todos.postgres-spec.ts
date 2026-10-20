import 'reflect-metadata';
import { randomUUID } from 'crypto';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { TodosService, TodoActor } from '../src/todos/todos.service';
import { PrismaService } from '../src/prisma';
import { UserNotificationsService } from '../src/notifications/user-notifications.service';
import { PushService } from '../src/notifications/push.service';
import { TodoReminderJob } from '../src/scheduler/jobs/todo-reminder.job';
import { TodoMaintenanceJob } from '../src/scheduler/jobs/todo-maintenance.job';

/**
 * Runs the todolist against a real PostgreSQL, to check what mocks cannot: the Prisma
 * queries themselves (ordering, cursors, relation filters, cascades) and the migrations.
 *
 *   TASKMASTER_TODOS_TEST_DATABASE_URL=postgresql://user:pwd@host/db
 *   TASKMASTER_TODOS_TEST_SCHEMA=tm_migtest      (optional: an isolated schema)
 *
 * The database must be a throwaway one: its name must end with taskmaster_todos_test,
 * or a schema must be given and start with tm_.
 */
const testUrl = process.env.TASKMASTER_TODOS_TEST_DATABASE_URL;
const schema = process.env.TASKMASTER_TODOS_TEST_SCHEMA;
const postgresTests = testUrl ? describe : describe.skip;

postgresTests('todolist against isolated PostgreSQL', () => {
  let client: PrismaClient;
  let pool: Pool;
  let service: TodosService;
  let inbox: UserNotificationsService;
  let siteId: number;
  let groupId: number;
  let owner: number;
  let member: number;
  let manager: number;
  let outsider: number;
  let root: string;
  const sent: { userId: number; title: string }[] = [];

  const actor = (
    userId: number,
    role = 'USER',
    groupIds = [groupId],
  ): TodoActor => ({
    userId,
    role,
    siteId,
    groupIds,
  });
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

  beforeAll(async () => {
    const okDatabase = new URL(testUrl!).pathname.endsWith(
      '/taskmaster_todos_test',
    );
    const okSchema = !!schema && schema.startsWith('tm_');
    if (!okDatabase && !okSchema) {
      throw new Error(
        'Use a database named taskmaster_todos_test, or a schema starting with tm_',
      );
    }
    root = mkdtempSync(join(tmpdir(), 'todos-it-'));
    process.env.TASKMASTER_DATA_DIR = root;

    pool = new Pool({ connectionString: testUrl });
    client = new PrismaClient({
      adapter: new PrismaPg(pool, schema ? { schema } : undefined),
    });
    const tag = randomUUID().slice(0, 8);
    siteId = (
      await client.site.create({ data: { name: `Todos ${tag}`, code: tag } })
    ).id;
    groupId = (
      await client.group.create({
        data: { name: `Team ${tag}`, siteId },
      })
    ).id;
    const makeUser = async (name: string, role: 'USER' | 'MANAGER') => {
      const user = await client.user.create({
        data: {
          username: `${name}-${tag}`,
          fullname: `${name} ${tag}`,
          email: `${name}-${tag}@example.com`,
          role,
        },
      });
      await client.userSiteAssignment.create({
        data: { userId: user.id, siteId, isDefault: true },
      });
      return user.id;
    };
    owner = await makeUser('owner', 'USER');
    member = await makeUser('member', 'USER');
    manager = await makeUser('manager', 'MANAGER');
    outsider = await makeUser('outsider', 'USER');
    for (const userId of [owner, member, manager]) {
      await client.userGroupMembership.create({ data: { userId, groupId } });
    }

    const prisma = { client } as unknown as PrismaService;
    const push = {
      sendToUser: jest.fn((userId: number, m: { title: string }) => {
        sent.push({ userId, title: m.title });
        return Promise.resolve();
      }),
    } as unknown as PushService;
    inbox = new UserNotificationsService(prisma, push);
    service = new TodosService(prisma, inbox);
  });

  afterAll(async () => {
    delete process.env.TASKMASTER_DATA_DIR;
    rmSync(root, { recursive: true, force: true });
    await client?.$disconnect();
    await pool?.end();
  });

  it('orders by priority, then manual position, then due date, then newest', async () => {
    const make = (title: string, extra: Record<string, unknown> = {}) =>
      service.create({ title, ...extra } as never, owner, siteId);
    await make('low', { priority: 'LOW' });
    await make('urgent-late', { priority: 'URGENT', dueDate: '2030-02-01' });
    await make('urgent-soon', { priority: 'URGENT', dueDate: '2030-01-01' });
    await make('urgent-undated', { priority: 'URGENT' });
    const first = await make('normal-a');
    const second = await make('normal-b');

    const before = titles(
      await service.findAll(owner, [groupId], siteId, 'PRIVATE'),
    );
    expect(before.slice(0, 3)).toEqual([
      'urgent-soon',
      'urgent-late',
      'urgent-undated',
    ]);
    expect(before[before.length - 1]).toBe('low');

    await service.reorder([second.id, first.id], owner, 'USER', siteId);
    const after = titles(
      await service.findAll(owner, [groupId], siteId, 'PRIVATE'),
    );
    expect(after.indexOf('normal-b')).toBeLessThan(after.indexOf('normal-a'));
    // Ordering one priority never moves the others.
    expect(after[0]).toBe('urgent-soon');
  });

  it('shows private todos to their owner only, collective ones to the group', async () => {
    await service.create({ title: 'secret' } as never, owner, siteId);
    await service.create(
      { title: 'for the team', scope: 'COLLECTIVE', groupId } as never,
      manager,
      siteId,
      'MANAGER',
    );

    const others = titles(
      await service.findAll(outsider, [], siteId, 'PRIVATE'),
    );
    expect(others).not.toContain('secret');
    const outsiderCollective = titles(
      await service.findAll(outsider, [], siteId, 'COLLECTIVE'),
    );
    expect(outsiderCollective).not.toContain('for the team');
    const memberCollective = titles(
      await service.findAll(member, [groupId], siteId, 'COLLECTIVE'),
    );
    expect(memberCollective).toContain('for the team');
  });

  it('assigns a collective todo, tells the assignee, and lets them hand it back', async () => {
    sent.length = 0;
    const todo = await service.create(
      {
        title: 'assigned job',
        scope: 'COLLECTIVE',
        groupId,
        assigneeId: member,
      } as never,
      manager,
      siteId,
      'MANAGER',
    );

    expect(todo.assignee?.id).toBe(member);
    const bell = await inbox.list(member);
    expect(bell.items.some((n) => n.type === 'todo.assigned')).toBe(true);
    expect(sent.some((s) => s.userId === member)).toBe(true);

    const released = await service.update(
      todo.id,
      { assigneeId: null },
      member,
      'USER',
      siteId,
    );
    expect(released.assigneeId).toBeNull();
    await expect(
      service.update(todo.id, { title: 'hijack' }, member, 'USER', siteId),
    ).rejects.toThrow();
  });

  it('keeps a ticked todo whose subtasks are not all done when clearing', async () => {
    const parentDone = await service.create(
      { title: 'parent with work left' } as never,
      owner,
      siteId,
    );
    await service.create(
      { title: 'open subtask', parentId: parentDone.id } as never,
      owner,
      siteId,
    );
    await service.update(
      parentDone.id,
      { isCompleted: true },
      owner,
      'USER',
      siteId,
    );

    const clean = await service.create(
      { title: 'clean parent' } as never,
      owner,
      siteId,
    );
    const sub = await service.create(
      { title: 'done subtask', parentId: clean.id } as never,
      owner,
      siteId,
    );
    await service.update(sub.id, { isCompleted: true }, owner, 'USER', siteId);
    await service.update(
      clean.id,
      { isCompleted: true },
      owner,
      'USER',
      siteId,
    );

    const result = await service.clearCompleted(
      'PRIVATE',
      owner,
      'USER',
      siteId,
      [],
    );
    // The count is the number of todos deleted on purpose; their subtasks go with them.
    expect(result.count).toBeGreaterThanOrEqual(1);

    expect(
      await client.todo.findUnique({ where: { id: parentDone.id } }),
    ).not.toBeNull();
    expect(
      await client.todo.findUnique({ where: { id: clean.id } }),
    ).toBeNull();
    expect(await client.todo.findUnique({ where: { id: sub.id } })).toBeNull();
  });

  it('pages the history of ticked todos, newest first, with a search', async () => {
    const tag = randomUUID().slice(0, 6);
    for (let i = 1; i <= 5; i++) {
      const todo = await service.create(
        { title: `history-${tag}-${i}` } as never,
        owner,
        siteId,
      );
      await service.update(
        todo.id,
        { isCompleted: true },
        owner,
        'USER',
        siteId,
      );
    }

    const page1 = await service.history(owner, [groupId], siteId, 'PRIVATE', {
      search: `history-${tag}`,
      take: 2,
    });
    expect(titles(page1.items)).toEqual([
      `history-${tag}-5`,
      `history-${tag}-4`,
    ]);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await service.history(owner, [groupId], siteId, 'PRIVATE', {
      search: `HISTORY-${tag}`,
      take: 2,
      cursor: page1.nextCursor!,
    });
    expect(titles(page2.items)).toEqual([
      `history-${tag}-3`,
      `history-${tag}-2`,
    ]);

    const last = await service.history(owner, [groupId], siteId, 'PRIVATE', {
      search: `history-${tag}`,
      take: 2,
      cursor: page2.nextCursor!,
    });
    expect(titles(last.items)).toEqual([`history-${tag}-1`]);
    expect(last.nextCursor).toBeNull();
  });

  it('counts overdue, due today and assigned-to-me todos', async () => {
    const lone = await client.user.create({
      data: { username: `lone-${randomUUID()}`, role: 'USER' },
    });
    await client.userSiteAssignment.create({
      data: { userId: lone.id, siteId, isDefault: true },
    });
    const now = new Date();
    const day = (offset: number) => {
      const d = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + offset,
        ),
      );
      return d.toISOString().slice(0, 10);
    };
    const make = (title: string, dueDate?: string) =>
      service.create({ title, dueDate } as never, lone.id, siteId);
    await make('late', day(-3));
    await make('late too', day(-1));
    await make('today', day(0));
    await make('later', day(5));
    await make('whenever');
    const done = await make('done and late', day(-2));
    await service.update(
      done.id,
      { isCompleted: true },
      lone.id,
      'USER',
      siteId,
    );

    expect(await service.summary(lone.id, [], siteId, now)).toEqual({
      overdue: 2,
      dueToday: 1,
      open: 5,
      mine: 0,
    });
  });

  it('never creates a copy when a todo is ticked', async () => {
    const todo = await service.create(
      { title: 'one-off check', dueDate: '2026-01-05' },
      owner,
      siteId,
    );
    await service.update(todo.id, { isCompleted: true }, owner, 'USER', siteId);

    expect(
      await client.todo.count({
        where: { userId: owner, title: 'one-off check' },
      }),
    ).toBe(1);
  });

  it('numbers comments and attachments on the todo and cascades on delete', async () => {
    const todo = await service.create(
      { title: 'with extras', scope: 'COLLECTIVE', groupId } as never,
      manager,
      siteId,
      'MANAGER',
    );
    await service.addComment(todo.id, 'first', actor(member));
    await service.addComment(todo.id, 'second', actor(manager, 'MANAGER'));
    await service.addAttachment(
      todo.id,
      { buffer: Buffer.from('%PDF-1.4 test'), originalname: 'doc.pdf' },
      actor(member),
    );

    const [listed] = (
      await service.findAll(member, [groupId], siteId, 'COLLECTIVE')
    ).filter((t) => t.id === todo.id);
    expect(listed._count).toEqual({ comments: 2, attachments: 1 });
    expect(
      (await service.listComments(todo.id, actor(member))).map((c) => c.body),
    ).toEqual(['first', 'second']);
    await expect(
      service.listComments(todo.id, actor(outsider, 'USER', [])),
    ).rejects.toThrow();

    await service.remove(todo.id, manager, 'MANAGER', siteId);
    expect(await client.todoComment.count({ where: { todoId: todo.id } })).toBe(
      0,
    );
    expect(
      await client.todoAttachment.count({ where: { todoId: todo.id } }),
    ).toBe(0);
  });

  it('reminds through the bell, once, with the lead time and the preferences', async () => {
    const reminded = await service.create(
      {
        title: 'reminder target',
        dueDate: '2026-03-10',
        dueTime: '14:00',
        remindBeforeMinutes: 60,
      } as never,
      owner,
      siteId,
    );
    const settings = {
      getRawValue: jest.fn((key: string) =>
        Promise.resolve(
          (
            {
              'addons.todolist.enabled': true,
              'addons.todolist.reminders.enabled': true,
              'email.enabled': false,
              'scheduler.timezone': 'Europe/Paris',
            } as Record<string, unknown>
          )[key],
        ),
      ),
    };
    const job = new TodoReminderJob(
      { client } as unknown as PrismaService,
      settings as never,
      { send: jest.fn() } as never,
      inbox,
    );

    // 14:00 Paris on 10 March is 13:00 UTC; the lead time is an hour.
    await job.execute(new Date('2026-03-10T11:59:00Z'));
    expect(
      (await inbox.list(owner)).items.filter((n) => n.type === 'todo.reminder'),
    ).toHaveLength(0);

    await job.execute(new Date('2026-03-10T12:00:00Z'));
    await job.execute(new Date('2026-03-10T12:30:00Z'));
    const bell = (await inbox.list(owner)).items.filter(
      (n) => n.type === 'todo.reminder',
    );
    expect(bell).toHaveLength(1);
    expect(bell[0].body).toContain('reminder target');
    expect(
      (await client.todo.findUnique({ where: { id: reminded.id } }))
        ?.reminderSentAt,
    ).not.toBeNull();

    await inbox.markAllRead(owner);
    expect((await inbox.list(owner)).unread).toBe(0);
  });

  it('runs the daily maintenance', async () => {
    const job = new TodoMaintenanceJob(inbox);
    await expect(
      job.execute(new Date('2026-01-21T00:10:00Z')),
    ).resolves.toBeUndefined();
  });

  it('keeps push subscriptions and moves them to whoever uses the browser next', async () => {
    const push = new PushService(
      { get: jest.fn() } as never,
      { client } as unknown as PrismaService,
      {} as never,
    );
    const endpoint = `https://push.example/${randomUUID()}`;
    await push.subscribe({
      endpoint,
      keys: { p256dh: 'p', auth: 'a' },
      userId: owner,
    });
    await push.subscribe({
      endpoint,
      keys: { p256dh: 'p2', auth: 'a2' },
      userId: member,
    });

    expect(await push.countForUser(owner)).toBe(0);
    expect(await push.countForUser(member)).toBe(1);
    await push.unsubscribe(endpoint, owner); // not theirs: nothing happens
    expect(await push.countForUser(member)).toBe(1);
    await push.unsubscribe(endpoint, member);
    expect(await push.countForUser(member)).toBe(0);
  });

  it('saves the reminder preferences of a person, email being opt-in', async () => {
    expect(await service.getPreferences(owner)).toEqual({
      email: false,
      push: true,
      collective: true,
    });
    expect(
      await service.updatePreferences(owner, {
        email: true,
        push: false,
        collective: false,
      }),
    ).toEqual({ email: true, push: false, collective: false });
    // Only that person: the other account keeps email off.
    expect((await service.getPreferences(member)).email).toBe(false);
  });
});
