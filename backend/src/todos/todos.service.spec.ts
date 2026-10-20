import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { TodosService } from './todos.service';

describe('TodosService.update', () => {
  const todoModel = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
  };
  const groupModel = { findFirst: jest.fn() };
  const membershipModel = { findFirst: jest.fn() };
  const service = new TodosService({
    client: {
      todo: todoModel,
      group: groupModel,
      userGroupMembership: membershipModel,
      $transaction: (cb: (tx: unknown) => unknown) => cb({ todo: todoModel }),
    },
  } as never);

  const privateTodo = {
    id: 1,
    scope: 'PRIVATE',
    userId: 7,
    siteId: 1,
    parentId: null,
    recurrence: 'NONE',
    isCompleted: false,
  };
  const collectiveTodo = {
    id: 2,
    scope: 'COLLECTIVE',
    userId: 3,
    siteId: 1,
    parentId: null,
    recurrence: 'NONE',
    isCompleted: false,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    todoModel.update.mockResolvedValue({ groupId: null });
    groupModel.findFirst.mockResolvedValue({ id: 4 });
  });

  it('only sends the fields that were provided', async () => {
    todoModel.findUnique.mockResolvedValue(privateTodo);

    await service.update(1, { title: 'Renamed' }, 7, 'USER', 1);

    expect(todoModel.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 1 },
        data: expect.objectContaining({ title: 'Renamed' }),
      }),
    );
    const { data } = todoModel.update.mock.calls[0][0];
    expect(data.dueDate).toBeUndefined();
    expect(data.groupId).toBeUndefined();
  });

  it('clears the due date and the group when null is sent', async () => {
    todoModel.findUnique.mockResolvedValue(collectiveTodo);

    await service.update(2, { dueDate: null, groupId: null }, 3, 'MANAGER', 1);

    const { data } = todoModel.update.mock.calls[0][0];
    expect(data).toMatchObject({ dueDate: null, groupId: null });
    expect(data.title).toBeUndefined();
    // Subtasks follow their parent out of the group.
    expect(todoModel.updateMany).toHaveBeenCalledWith({
      where: { parentId: 2 },
      data: { groupId: null },
    });
  });

  it('sets a due date', async () => {
    todoModel.findUnique.mockResolvedValue(privateTodo);

    await service.update(1, { dueDate: '2026-11-02' }, 7, 'USER', 1);

    expect(todoModel.update.mock.calls[0][0].data.dueDate).toEqual(
      new Date('2026-11-02'),
    );
  });

  it("refuses editing someone else's private todo", async () => {
    todoModel.findUnique.mockResolvedValue(privateTodo);

    await expect(
      service.update(1, { title: 'x' }, 99, 'SUPER_ADMIN', 1),
    ).rejects.toThrow(ForbiddenException);
    expect(todoModel.update).not.toHaveBeenCalled();
  });

  it('refuses a standard user editing a collective todo', async () => {
    todoModel.findUnique.mockResolvedValue(collectiveTodo);

    await expect(
      service.update(2, { title: 'x' }, 3, 'USER', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lets a group member tick a collective todo', async () => {
    todoModel.findUnique.mockResolvedValue({ ...collectiveTodo, groupId: 4 });
    membershipModel.findFirst.mockResolvedValue({ userId: 8 });

    await service.update(2, { isCompleted: true }, 8, 'USER', 1);

    expect(todoModel.update).toHaveBeenCalled();
  });

  it('lets anyone tick a site-wide collective todo', async () => {
    todoModel.findUnique.mockResolvedValue({
      ...collectiveTodo,
      groupId: null,
    });

    await service.update(2, { isCompleted: true }, 8, 'USER', 1);

    expect(todoModel.update).toHaveBeenCalled();
  });

  it('refuses ticking a collective todo of a group the user is not in', async () => {
    todoModel.findUnique.mockResolvedValue({ ...collectiveTodo, groupId: 4 });
    membershipModel.findFirst.mockResolvedValue(null);

    await expect(
      service.update(2, { isCompleted: true }, 8, 'USER', 1),
    ).rejects.toThrow(ForbiddenException);
  });

  it('refuses a member changing more than the checkbox', async () => {
    todoModel.findUnique.mockResolvedValue({ ...collectiveTodo, groupId: 4 });
    membershipModel.findFirst.mockResolvedValue({ userId: 8 });

    await expect(
      service.update(
        2,
        { isCompleted: true, priority: 'URGENT' },
        8,
        'USER',
        1,
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('reports a missing todo', async () => {
    todoModel.findUnique.mockResolvedValue(null);

    await expect(
      service.update(5, { title: 'x' }, 7, 'USER', 1),
    ).rejects.toThrow(NotFoundException);
  });

  it('hides a todo from another site', async () => {
    todoModel.findUnique.mockResolvedValue({ ...collectiveTodo, siteId: 2 });

    await expect(
      service.update(2, { title: 'x' }, 3, 'MANAGER', 1),
    ).rejects.toThrow(NotFoundException);
    expect(todoModel.update).not.toHaveBeenCalled();
  });

  it('refuses a group that is not in the site', async () => {
    todoModel.findUnique.mockResolvedValue(collectiveTodo);
    groupModel.findFirst.mockResolvedValue(null);

    await expect(
      service.update(2, { groupId: 99 }, 3, 'MANAGER', 1),
    ).rejects.toThrow(NotFoundException);
    expect(todoModel.update).not.toHaveBeenCalled();
  });
});

describe('TodosService.remove', () => {
  const todoModel = { findUnique: jest.fn(), delete: jest.fn() };
  const service = new TodosService({ client: { todo: todoModel } } as never);

  beforeEach(() => jest.resetAllMocks());

  it('hides a todo from another site', async () => {
    todoModel.findUnique.mockResolvedValue({
      id: 2,
      scope: 'COLLECTIVE',
      userId: 3,
      siteId: 2,
    });

    await expect(service.remove(2, 3, 'MANAGER', 1)).rejects.toThrow(
      NotFoundException,
    );
    expect(todoModel.delete).not.toHaveBeenCalled();
  });
});

describe('TodosService subtasks and cleanup', () => {
  const todoModel = {
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    create: jest.fn(),
    findMany: jest.fn(),
    createMany: jest.fn(),
    deleteMany: jest.fn(),
  };
  const attachmentModel = { findMany: jest.fn().mockResolvedValue([]) };
  const service = new TodosService({
    client: {
      todo: todoModel,
      todoAttachment: attachmentModel,
      group: { findFirst: jest.fn() },
      userGroupMembership: { findFirst: jest.fn() },
      $transaction: (cb: (tx: unknown) => unknown) => cb({ todo: todoModel }),
    },
  } as never);

  const parent = {
    id: 10,
    scope: 'PRIVATE',
    userId: 7,
    siteId: 1,
    groupId: null,
    parentId: null,
    recurrence: 'NONE',
    spawnedNextAt: null,
    assigneeId: null,
    isCompleted: false,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    attachmentModel.findMany.mockResolvedValue([]);
    todoModel.update.mockResolvedValue({ groupId: null });
    todoModel.create.mockResolvedValue({ id: 99 });
    todoModel.findMany.mockResolvedValue([]);
  });

  it('creates a subtask that inherits scope, owner and group from its parent', async () => {
    todoModel.findUnique.mockResolvedValue({
      ...parent,
      scope: 'COLLECTIVE',
      userId: 3,
      groupId: 4,
    });

    await service.create({ title: 'Step 1', parentId: 10 }, 3, 1, 'MANAGER');

    expect(todoModel.create.mock.calls[0][0].data).toMatchObject({
      parentId: 10,
      scope: 'COLLECTIVE',
      userId: 3,
      groupId: 4,
    });
  });

  it('refuses a subtask of a subtask', async () => {
    todoModel.findUnique.mockResolvedValue({ ...parent, parentId: 5 });

    await expect(
      service.create({ title: 'x', parentId: 10 }, 7, 1, 'USER'),
    ).rejects.toThrow(BadRequestException);
  });

  it("refuses a subtask on someone else's private todo", async () => {
    todoModel.findUnique.mockResolvedValue(parent);

    await expect(
      service.create({ title: 'x', parentId: 10 }, 99, 1, 'USER'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('records who ticked a todo, and clears it when unticked', async () => {
    todoModel.findUnique.mockResolvedValue(parent);
    await service.update(10, { isCompleted: true }, 7, 'USER', 1);
    expect(todoModel.update.mock.calls[0][0].data).toMatchObject({
      isCompleted: true,
      completedById: 7,
    });

    todoModel.findUnique.mockResolvedValue({ ...parent, isCompleted: true });
    await service.update(10, { isCompleted: false }, 7, 'USER', 1);
    expect(todoModel.update.mock.calls[1][0].data).toMatchObject({
      completedAt: null,
      completedById: null,
    });
  });

  it('re-arms the reminder when the due date changes', async () => {
    todoModel.findUnique.mockResolvedValue(parent);

    await service.update(10, { dueDate: '2026-12-01' }, 7, 'USER', 1);

    expect(todoModel.update.mock.calls[0][0].data.reminderSentAt).toBeNull();
  });

  it('ticking a todo never creates another one (no recurrence in the todolist)', async () => {
    todoModel.findUnique.mockResolvedValue({ ...parent, recurrence: 'WEEKLY' });

    await service.update(10, { isCompleted: true }, 7, 'USER', 1);

    expect(todoModel.create).not.toHaveBeenCalled();
    expect(todoModel.createMany).not.toHaveBeenCalled();
  });

  it('only lets managers clear completed collective todos', async () => {
    await expect(
      service.clearCompleted('COLLECTIVE', 3, 'USER', 1, [4]),
    ).rejects.toThrow(ForbiddenException);
    expect(todoModel.deleteMany).not.toHaveBeenCalled();
  });

  it("clears only the user's own completed private todos, keeping those with work left", async () => {
    todoModel.findMany.mockResolvedValue([{ id: 4 }, { id: 5 }]);

    await service.clearCompleted('PRIVATE', 7, 'USER', 1, []);

    expect(todoModel.findMany).toHaveBeenCalledWith({
      where: {
        siteId: 1,
        scope: 'PRIVATE',
        isCompleted: true,
        parentId: null,
        subtasks: { none: { isCompleted: false } },
        userId: 7,
      },
      select: { id: true },
    });
    expect(todoModel.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: [4, 5] } },
    });
  });
});
