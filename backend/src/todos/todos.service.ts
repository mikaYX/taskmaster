import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Prisma, TodoScope } from '@prisma/client';

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
        orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }],
      });
    }

    if (scope === 'COLLECTIVE') {
      return this.prisma.client.todo.findMany({
        where: { ...baseWhere, ...collectiveCondition },
        orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }],
      });
    }

    return this.prisma.client.todo.findMany({
      where: {
        ...baseWhere,
        OR: [privateCondition, collectiveCondition],
      },
      orderBy: [{ isCompleted: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: CreateTodoDto, userId: number, siteId: number) {
    return this.prisma.client.todo.create({
      data: {
        title: dto.title,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        scope: dto.scope,
        groupId: dto.groupId,
        userId,
        siteId,
      },
    });
  }

  async update(
    id: number,
    dto: UpdateTodoDto,
    userId: number,
    userRole: string,
  ) {
    const todo = await this.prisma.client.todo.findUnique({
      where: { id },
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

    if (todo.scope === TodoScope.PRIVATE && todo.userId !== userId) {
      throw new ForbiddenException(
        'You can only update your own private todos',
      );
    }

    if (
      todo.scope === TodoScope.COLLECTIVE &&
      userRole !== 'MANAGER' &&
      userRole !== 'ADMIN' &&
      userRole !== 'SUPER_ADMIN'
    ) {
      throw new ForbiddenException(
        'You need MANAGER or above role to update collective todos',
      );
    }

    const updateData: Prisma.TodoUncheckedUpdateInput = {
      title: dto.title,
      dueDate:
        dto.dueDate !== undefined
          ? dto.dueDate
            ? new Date(dto.dueDate)
            : null
          : undefined,
      groupId: dto.groupId,
    };

    if (dto.isCompleted !== undefined) {
      updateData.isCompleted = dto.isCompleted;
      if (dto.isCompleted && !todo.isCompleted) {
        updateData.completedAt = new Date();
      } else if (!dto.isCompleted) {
        updateData.completedAt = null;
      }
    }

    return this.prisma.client.todo.update({
      where: { id },
      data: updateData,
    });
  }

  async remove(id: number, userId: number, userRole: string) {
    const todo = await this.prisma.client.todo.findUnique({
      where: { id },
    });

    if (!todo) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }

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
