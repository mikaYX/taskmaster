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

function fixture() {
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
  };
  const comment = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
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
    todoAttachment: attachment,
    group: { findFirst: jest.fn().mockResolvedValue({ id: 4 }) },
    userGroupMembership: {
      findFirst: jest.fn().mockResolvedValue({ userId: 8 }),
    },
    $transaction: jest.fn(),
  };
  client.$transaction.mockImplementation((arg: unknown) =>
    typeof arg === 'function'
      ? (arg as (tx: unknown) => unknown)({ todo })
      : Promise.all(arg as unknown[]),
  );
  const inbox = { notify: jest.fn().mockResolvedValue(undefined) };
  const service = new TodosService({ client } as never, inbox as never);
  return { service, client, todo, user, comment, attachment, inbox };
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
      expect.objectContaining({ type: 'todo.assigned', url: '/todos' }),
      { push: true },
    );
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

  it('does not create another occurrence when the job already did', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue({
      ...collective,
      scope: 'PRIVATE',
      userId: 7,
      recurrence: 'WEEKLY',
      dueDate: new Date('2026-10-01'),
      spawnedNextAt: new Date('2026-10-05'),
    });
    todo.update.mockResolvedValue({ ...collective });

    await service.update(2, { isCompleted: true }, 7, 'USER', 1);

    expect(todo.create).not.toHaveBeenCalled();
  });
});

describe('TodosService.rollOverdueRecurring', () => {
  const now = new Date('2026-10-20T03:00:00Z');
  const late = {
    ...collective,
    scope: 'PRIVATE',
    recurrence: 'WEEKLY',
    dueDate: new Date('2026-10-12'),
    dueTime: '08:00',
    remindBeforeMinutes: 60,
    assigneeId: null,
    position: 2,
  };

  it('creates the next occurrence of a late recurring todo, once', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValueOnce([late]).mockResolvedValueOnce([]);
    todo.updateMany.mockResolvedValue({ count: 1 });
    todo.create.mockResolvedValue({ id: 50 });

    const created = await service.rollOverdueRecurring(now);

    expect(created).toBe(1);
    expect(todo.updateMany).toHaveBeenCalledWith({
      where: { id: 2, spawnedNextAt: null },
      data: { spawnedNextAt: now },
    });
    expect(todo.create.mock.calls[0][0].data).toMatchObject({
      title: 'Inspect line',
      dueDate: new Date('2026-10-26'),
      dueTime: '08:00',
      remindBeforeMinutes: 60,
      position: 2,
    });
  });

  it('only picks recurring, unticked, not-yet-rolled todos whose date has passed', async () => {
    const { service, todo } = fixture();

    await service.rollOverdueRecurring(now);

    expect(todo.findMany.mock.calls[0][0].where).toEqual({
      recurrence: { not: 'NONE' },
      isCompleted: false,
      parentId: null,
      spawnedNextAt: null,
      dueDate: { lt: new Date('2026-10-20T00:00:00Z') },
    });
  });

  it('skips a todo another run already claimed', async () => {
    const { service, todo } = fixture();
    todo.findMany.mockResolvedValueOnce([late]);
    todo.updateMany.mockResolvedValue({ count: 0 });

    expect(await service.rollOverdueRecurring(now)).toBe(0);
    expect(todo.create).not.toHaveBeenCalled();
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

  it('adds a trimmed comment and tells the people in charge', async () => {
    const { service, todo, comment, inbox } = fixture();
    todo.findUnique.mockResolvedValue({ ...collective, assigneeId: 5 });
    comment.create.mockResolvedValue({
      id: 1,
      body: 'Done soon',
      user: { id: 8, username: 'jean', fullname: 'Jean Martin' },
    });

    await service.addComment(2, '  Done soon  ', actor());

    expect(comment.create.mock.calls[0][0].data).toEqual({
      todoId: 2,
      userId: 8,
      body: 'Done soon',
    });
    expect(inbox.notify.mock.calls.map(([id]) => id).sort()).toEqual([3, 5]);
  });

  it('refuses an empty comment', async () => {
    const { service, todo } = fixture();
    todo.findUnique.mockResolvedValue(collective);

    await expect(service.addComment(2, '   ', actor())).rejects.toThrow(
      BadRequestException,
    );
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
    comment.findFirst.mockResolvedValue({ id: 1, userId: 8 });
    await expect(service.deleteComment(2, 1, actor())).resolves.toEqual({
      success: true,
    });
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
