import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Prisma, Todo, TodoRecurrence, TodoScope } from '@prisma/client';
import { nextDueDate } from './todo-recurrence';

/** Who ticked the todo, for collective lists. */
const TODO_INCLUDE = {
  completedBy: { select: { id: true, username: true, fullname: true } },
} satisfies Prisma.TodoInclude;

// Postgres sorts enums in declaration order, so 'desc' puts URGENT first.
const TODO_ORDER: Prisma.TodoOrderByWithRelationInput[] = [
  { isCompleted: 'asc' },
  { priority: 'desc' },
  { dueDate: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'desc' },
];

@Injectable()
export class TodosService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    userId: number,
    userGroupIds: number[],
    siteId: number,
    scope?: 'PRIVATE' | 'COLLECTIVE',
  ) {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const baseWhere: Prisma.TodoWhereInput = {
      siteId,
      OR: [
        { isCompleted: false },
        { completedAt: { gte: twentyFourHoursAgo } },
      ],
    };

    const privateCondition: Prisma.TodoWhereInput = {
      scope: TodoScope.PRIVATE,
      userId,
    };

    const collectiveCondition: Prisma.TodoWhereInput = {
      scope: TodoScope.COLLECTIVE,
      OR: [{ groupId: { in: userGroupIds } }, { groupId: null }],
    };

    if (scope === 'PRIVATE') {
      return this.prisma.client.todo.findMany({
        where: { ...baseWhere, ...privateCondition },
        orderBy: TODO_ORDER,
        include: TODO_INCLUDE,
      });
    }

    if (scope === 'COLLECTIVE') {
      return this.prisma.client.todo.findMany({
        where: { ...baseWhere, ...collectiveCondition },
        orderBy: TODO_ORDER,
        include: TODO_INCLUDE,
      });
    }

    return this.prisma.client.todo.findMany({
      where: {
        ...baseWhere,
        OR: [privateCondition, collectiveCondition],
      },
      orderBy: TODO_ORDER,
      include: TODO_INCLUDE,
    });
  }

  private async assertGroupInSite(groupId: number, siteId: number) {
    const group = await this.prisma.client.group.findFirst({
      where: { id: groupId, siteId, deletedAt: null },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }
  }

  private isManager(role: string) {
    return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  /** A member of the todo's group (or anyone, for a site-wide todo) may only tick it. */
  private async canToggleCollective(
    todo: { groupId: number | null },
    dto: UpdateTodoDto,
    userId: number,
  ) {
    const keys = Object.keys(dto).filter(
      (k) => dto[k as keyof UpdateTodoDto] !== undefined,
    );
    if (keys.length !== 1 || keys[0] !== 'isCompleted') return false;
    if (todo.groupId === null) return true;
    const membership = await this.prisma.client.userGroupMembership.findFirst({
      where: { userId, groupId: todo.groupId },
      select: { userId: true },
    });
    return membership !== null;
  }

  private async findInSite(id: number, siteId: number) {
    const todo = await this.prisma.client.todo.findUnique({ where: { id } });
    // Same error for a missing todo and one from another site: don't leak IDs.
    if (!todo || todo.siteId !== siteId) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }
    return todo;
  }

  async create(
    dto: CreateTodoDto,
    userId: number,
    siteId: number,
    userRole = 'USER',
  ) {
    if (dto.parentId != null) {
      return this.createSubtask(dto, dto.parentId, userId, siteId, userRole);
    }
    if (dto.groupId != null) {
      await this.assertGroupInSite(dto.groupId, siteId);
    }
    return this.prisma.client.todo.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        scope: dto.scope,
        priority: dto.priority,
        recurrence: dto.recurrence,
        groupId: dto.groupId,
        userId,
        siteId,
      },
      include: TODO_INCLUDE,
    });
  }

  /** Subtasks stay on one level and follow their parent's scope, owner and group. */
  private async createSubtask(
    dto: CreateTodoDto,
    parentId: number,
    userId: number,
    siteId: number,
    userRole: string,
  ) {
    const parent = await this.findInSite(parentId, siteId);
    if (parent.parentId !== null) {
      throw new BadRequestException('A subtask cannot have subtasks');
    }
    this.assertCanManage(parent, userId, userRole);

    return this.prisma.client.todo.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        priority: dto.priority,
        scope: parent.scope,
        groupId: parent.groupId,
        parentId: parent.id,
        userId: parent.userId,
        siteId,
      },
      include: TODO_INCLUDE,
    });
  }

  /** Private todos belong to their owner; collective ones to managers. */
  private assertCanManage(
    todo: { scope: TodoScope; userId: number },
    userId: number,
    userRole: string,
  ) {
    if (todo.scope === TodoScope.PRIVATE && todo.userId !== userId) {
      throw new ForbiddenException(
        'You can only change your own private todos',
      );
    }
    if (todo.scope === TodoScope.COLLECTIVE && !this.isManager(userRole)) {
      throw new ForbiddenException(
        'You need MANAGER or above role to change collective todos',
      );
    }
  }

  async update(
    id: number,
    dto: UpdateTodoDto,
    userId: number,
    userRole: string,
    siteId: number,
  ) {
    const todo = await this.findInSite(id, siteId);

    if (dto.groupId != null) {
      await this.assertGroupInSite(dto.groupId, siteId);
    }

    if (todo.scope === TodoScope.PRIVATE && todo.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own private todos',
      );
    }

    if (
      todo.scope === TodoScope.COLLECTIVE &&
      !this.isManager(userRole) &&
      !(await this.canToggleCollective(todo, dto, userId))
    ) {
      throw new ForbiddenException(
        'You need MANAGER or above role to update collective todos',
      );
    }

    if (
      todo.parentId !== null &&
      dto.recurrence !== undefined &&
      dto.recurrence !== TodoRecurrence.NONE
    ) {
      throw new BadRequestException('A subtask cannot repeat');
    }
    if (todo.parentId !== null && dto.groupId !== undefined) {
      throw new BadRequestException(
        'A subtask follows the group of its parent',
      );
    }

    const updateData: Prisma.TodoUncheckedUpdateInput = {
      title: dto.title,
      priority: dto.priority,
      recurrence: dto.recurrence,
      description:
        dto.description !== undefined ? dto.description || null : undefined,
      groupId: dto.groupId,
    };

    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      // A new date deserves a new reminder.
      updateData.reminderSentAt = null;
    }

    const justCompleted = dto.isCompleted === true && !todo.isCompleted;
    if (dto.isCompleted !== undefined) {
      updateData.isCompleted = dto.isCompleted;
      if (justCompleted) {
        updateData.completedAt = new Date();
        updateData.completedById = userId;
      } else if (!dto.isCompleted) {
        updateData.completedAt = null;
        updateData.completedById = null;
      }
    }

    const spawnsNext =
      justCompleted &&
      todo.parentId === null &&
      todo.recurrence !== TodoRecurrence.NONE;

    if (!spawnsNext && dto.groupId === undefined) {
      return this.prisma.client.todo.update({
        where: { id },
        data: updateData,
        include: TODO_INCLUDE,
      });
    }

    return this.prisma.client.$transaction(async (tx) => {
      const updated = await tx.todo.update({
        where: { id },
        data: updateData,
        include: TODO_INCLUDE,
      });
      if (dto.groupId !== undefined) {
        // Subtasks stay with their parent's group.
        await tx.todo.updateMany({
          where: { parentId: id },
          data: { groupId: dto.groupId },
        });
      }
      if (spawnsNext) {
        await this.spawnNextOccurrence(tx, todo, updated.groupId);
      }
      return updated;
    });
  }

  /** Recreates a recurring todo (and its subtasks, unticked) for its next date. */
  private async spawnNextOccurrence(
    tx: Prisma.TransactionClient,
    todo: Todo,
    groupId: number | null,
  ) {
    const next = await tx.todo.create({
      data: {
        title: todo.title,
        description: todo.description,
        dueDate: nextDueDate(todo.dueDate, todo.recurrence),
        scope: todo.scope,
        priority: todo.priority,
        recurrence: todo.recurrence,
        groupId,
        userId: todo.userId,
        siteId: todo.siteId,
      },
    });
    const subtasks = await tx.todo.findMany({
      where: { parentId: todo.id },
      orderBy: { id: 'asc' },
    });
    if (subtasks.length > 0) {
      await tx.todo.createMany({
        data: subtasks.map((s) => ({
          title: s.title,
          description: s.description,
          priority: s.priority,
          scope: s.scope,
          groupId,
          parentId: next.id,
          userId: s.userId,
          siteId: s.siteId,
        })),
      });
    }
  }

  /** Deletes the ticked top-level todos of a tab (their subtasks go with them). */
  async clearCompleted(
    scope: TodoScope,
    userId: number,
    userRole: string,
    siteId: number,
    userGroupIds: number[],
  ) {
    if (scope === TodoScope.COLLECTIVE && !this.isManager(userRole)) {
      throw new ForbiddenException(
        'You need MANAGER or above role to delete collective todos',
      );
    }
    const where: Prisma.TodoWhereInput = {
      siteId,
      scope,
      isCompleted: true,
      parentId: null,
      ...(scope === TodoScope.PRIVATE
        ? { userId }
        : { OR: [{ groupId: { in: userGroupIds } }, { groupId: null }] }),
    };
    return this.prisma.client.todo.deleteMany({ where });
  }

  async remove(id: number, userId: number, userRole: string, siteId: number) {
    const todo = await this.findInSite(id, siteId);

    if (todo.scope === TodoScope.PRIVATE && todo.userId !== userId) {
      throw new ForbiddenException(
        'You can only delete your own private todos',
      );
    }

    if (
      todo.scope === TodoScope.COLLECTIVE &&
      userRole !== 'MANAGER' &&
      userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'You need MANAGER or above role to delete collective todos',
      );
    }

    return this.prisma.client.todo.delete({
      where: { id },
    });
  }
}
