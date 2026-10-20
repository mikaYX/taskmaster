import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { createReadStream, promises as fs } from 'fs';
import { basename, join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { getTodoAttachmentsDir } from '../config/app-paths';
import { UserNotificationsService } from '../notifications/user-notifications.service';
import { CreateTodoDto } from './dto/create-todo.dto';
import { UpdateTodoDto } from './dto/update-todo.dto';
import { Prisma, Todo, TodoScope } from '@prisma/client';

const USER_BRIEF = { select: { id: true, username: true, fullname: true } };

/** Who ticked the todo, who is in charge, and how much is attached. */
const TODO_INCLUDE = {
  completedBy: USER_BRIEF,
  assignee: USER_BRIEF,
  _count: { select: { comments: true, attachments: true } },
} satisfies Prisma.TodoInclude;

// Postgres sorts enums in declaration order, so 'desc' puts URGENT first.
// Inside a priority, the manual order (drag and drop) comes before the due date.
const TODO_ORDER: Prisma.TodoOrderByWithRelationInput[] = [
  { isCompleted: 'asc' },
  { priority: 'desc' },
  { position: 'asc' },
  { dueDate: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'desc' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
const ATTACHMENTS_PER_TODO = 10;
const HISTORY_PAGE = 30;

const startOfUtcDay = (d: Date) =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** The person acting, as the controller knows them. */
export interface TodoActor {
  userId: number;
  role: string;
  siteId: number;
  groupIds: number[];
}

/** PNG, JPEG, WebP and PDF are recognised by their first bytes, never by the file name. */
export function detectAttachmentType(buffer: Buffer): string | undefined {
  if (buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) {
    return 'image/jpeg';
  }
  if (
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png';
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return undefined;
}

@Injectable()
export class TodosService {
  private readonly logger = new Logger(TodosService.name);

  constructor(
    private prisma: PrismaService,
    // Optional so a context without the notifications module (and older specs) still builds.
    @Optional() private readonly inbox?: UserNotificationsService,
  ) {}

  // ------------------------------------------------------------------
  // Visibility
  // ------------------------------------------------------------------

  private privateCondition(userId: number): Prisma.TodoWhereInput {
    return { scope: TodoScope.PRIVATE, userId };
  }

  private collectiveCondition(userGroupIds: number[]): Prisma.TodoWhereInput {
    return {
      scope: TodoScope.COLLECTIVE,
      OR: [{ groupId: { in: userGroupIds } }, { groupId: null }],
    };
  }

  private visibleTo(
    userId: number,
    userGroupIds: number[],
    scope?: 'PRIVATE' | 'COLLECTIVE',
  ): Prisma.TodoWhereInput {
    if (scope === 'PRIVATE') return this.privateCondition(userId);
    if (scope === 'COLLECTIVE') return this.collectiveCondition(userGroupIds);
    return {
      OR: [
        this.privateCondition(userId),
        this.collectiveCondition(userGroupIds),
      ],
    };
  }

  async findAll(
    userId: number,
    userGroupIds: number[],
    siteId: number,
    scope?: 'PRIVATE' | 'COLLECTIVE',
  ) {
    const twentyFourHoursAgo = new Date(Date.now() - DAY_MS);

    return this.prisma.client.todo.findMany({
      where: {
        AND: [
          {
            siteId,
            OR: [
              { isCompleted: false },
              { completedAt: { gte: twentyFourHoursAgo } },
            ],
          },
          this.visibleTo(userId, userGroupIds, scope),
        ],
      },
      orderBy: TODO_ORDER,
      include: TODO_INCLUDE,
    });
  }

  /** Counters for the badges and the opening reminder: what needs attention now. */
  async summary(
    userId: number,
    userGroupIds: number[],
    siteId: number,
    now: Date = new Date(),
  ) {
    const start = startOfUtcDay(now);
    const end = new Date(start.getTime() + DAY_MS);
    const open: Prisma.TodoWhereInput = {
      AND: [
        { siteId, isCompleted: false, parentId: null },
        this.visibleTo(userId, userGroupIds),
      ],
    };
    const [overdue, dueToday, total, mine] = await Promise.all([
      this.prisma.client.todo.count({
        where: { AND: [open, { dueDate: { lt: start } }] },
      }),
      this.prisma.client.todo.count({
        where: { AND: [open, { dueDate: { gte: start, lt: end } }] },
      }),
      this.prisma.client.todo.count({ where: open }),
      this.prisma.client.todo.count({
        where: { AND: [open, { assigneeId: userId }] },
      }),
    ]);
    return { overdue, dueToday, open: total, mine };
  }

  /** Every ticked todo, newest first, searchable: the 24-hour list forgets them. */
  async history(
    userId: number,
    userGroupIds: number[],
    siteId: number,
    scope: 'PRIVATE' | 'COLLECTIVE' | undefined,
    options: { search?: string; cursor?: number; take?: number } = {},
  ) {
    const take = Math.min(Math.max(options.take ?? HISTORY_PAGE, 1), 100);
    const search = options.search?.trim();
    const rows = await this.prisma.client.todo.findMany({
      where: {
        AND: [
          { siteId, isCompleted: true, parentId: null },
          this.visibleTo(userId, userGroupIds, scope),
          ...(search
            ? [{ title: { contains: search, mode: 'insensitive' as const } }]
            : []),
        ],
      },
      orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
      take: take + 1,
      ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
      include: TODO_INCLUDE,
    });
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  private async assertGroupInSite(groupId: number, siteId: number) {
    const group = await this.prisma.client.group.findFirst({
      where: { id: groupId, siteId, deletedAt: null },
      select: { id: true },
    });
    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }
  }

  /** Someone in charge must be a real, active member of the site. */
  private async assertAssignee(assigneeId: number, siteId: number) {
    const user = await this.prisma.client.user.findFirst({
      where: {
        id: assigneeId,
        deletedAt: null,
        role: { not: 'GUEST' },
        sites: { some: { siteId } },
      },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        'The assignee must be an active member of the site',
      );
    }
  }

  private isManager(role: string) {
    return role === 'MANAGER' || role === 'ADMIN' || role === 'SUPER_ADMIN';
  }

  private async isGroupMember(userId: number, groupId: number | null) {
    if (groupId === null) return true;
    const membership = await this.prisma.client.userGroupMembership.findFirst({
      where: { userId, groupId },
      select: { userId: true },
    });
    return membership !== null;
  }

  /**
   * A member of the todo's group (or anyone, for a site-wide todo) may tick it, take it
   * or let it go: nothing else.
   */
  private async canMemberEditCollective(
    todo: { groupId: number | null; assigneeId: number | null },
    dto: UpdateTodoDto,
    userId: number,
  ) {
    const keys = Object.keys(dto).filter(
      (k) => dto[k as keyof UpdateTodoDto] !== undefined,
    );
    if (keys.length !== 1) return false;
    if (keys[0] === 'assigneeId') {
      const takes =
        dto.assigneeId === userId &&
        (todo.assigneeId === null || todo.assigneeId === userId);
      const releases = dto.assigneeId === null && todo.assigneeId === userId;
      if (!takes && !releases) return false;
    } else if (keys[0] !== 'isCompleted') {
      return false;
    }
    return this.isGroupMember(userId, todo.groupId);
  }

  private async findInSite(id: number, siteId: number) {
    const todo = await this.prisma.client.todo.findUnique({ where: { id } });
    // Same error for a missing todo and one from another site: don't leak IDs.
    if (!todo || todo.siteId !== siteId) {
      throw new NotFoundException(`Todo with ID ${id} not found`);
    }
    return todo;
  }

  /** The todo, if this person is allowed to see it (same rule as the lists). */
  private async findVisible(id: number, actor: TodoActor) {
    const todo = await this.findInSite(id, actor.siteId);
    const visible =
      todo.scope === TodoScope.PRIVATE
        ? todo.userId === actor.userId
        : todo.groupId === null || actor.groupIds.includes(todo.groupId);
    if (!visible) throw new NotFoundException(`Todo with ID ${id} not found`);
    return todo;
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

  private async displayName(userId: number): Promise<string> {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { username: true, fullname: true },
    });
    return user?.fullname || user?.username || '?';
  }

  /** Bell entry for one person, and a browser pop-up when they asked for those. */
  private async tell(
    userId: number,
    notification: { type: string; title: string; body?: string },
  ) {
    if (!this.inbox) return;
    const prefs = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { todoReminderPush: true },
    });
    await this.inbox.notify(
      userId,
      { ...notification, url: '/todos' },
      { push: prefs?.todoReminderPush ?? false },
    );
  }

  // ------------------------------------------------------------------
  // Create / update / delete
  // ------------------------------------------------------------------

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
    if (dto.assigneeId != null) {
      if (dto.scope !== TodoScope.COLLECTIVE) {
        throw new BadRequestException('Only collective todos can be assigned');
      }
      await this.assertAssignee(dto.assigneeId, siteId);
    }
    const todo = await this.prisma.client.todo.create({
      data: {
        title: dto.title,
        description: dto.description || null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
        dueTime: dto.dueTime ?? null,
        remindBeforeMinutes: dto.remindBeforeMinutes ?? null,
        scope: dto.scope,
        priority: dto.priority,
        groupId: dto.groupId,
        assigneeId: dto.assigneeId ?? null,
        userId,
        siteId,
      },
      include: TODO_INCLUDE,
    });
    if (todo.assigneeId !== null && todo.assigneeId !== userId) {
      await this.notifyAssigned(todo.assigneeId, todo.title, userId);
    }
    return todo;
  }

  private async notifyAssigned(
    assigneeId: number,
    title: string,
    actorId: number,
  ) {
    await this.tell(assigneeId, {
      type: 'todo.assigned',
      title: 'Tâche assignée',
      body: `${await this.displayName(actorId)} vous a confié : ${title}`,
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
        dueTime: dto.dueTime ?? null,
        remindBeforeMinutes: dto.remindBeforeMinutes ?? null,
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
      !(await this.canMemberEditCollective(todo, dto, userId))
    ) {
      throw new ForbiddenException(
        'You need MANAGER or above role to update collective todos',
      );
    }

    if (todo.parentId !== null && dto.groupId !== undefined) {
      throw new BadRequestException(
        'A subtask follows the group of its parent',
      );
    }
    if (dto.assigneeId !== undefined) {
      if (todo.scope !== TodoScope.COLLECTIVE || todo.parentId !== null) {
        throw new BadRequestException('Only collective todos can be assigned');
      }
      if (dto.assigneeId !== null) {
        await this.assertAssignee(dto.assigneeId, siteId);
      }
    }

    const updateData: Prisma.TodoUncheckedUpdateInput = {
      title: dto.title,
      priority: dto.priority,
      description:
        dto.description !== undefined ? dto.description || null : undefined,
      groupId: dto.groupId,
      assigneeId: dto.assigneeId,
    };

    if (dto.dueDate !== undefined) {
      updateData.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    }
    if (dto.dueTime !== undefined) updateData.dueTime = dto.dueTime;
    if (dto.remindBeforeMinutes !== undefined) {
      updateData.remindBeforeMinutes = dto.remindBeforeMinutes;
    }
    if (
      dto.dueDate !== undefined ||
      dto.dueTime !== undefined ||
      dto.remindBeforeMinutes !== undefined
    ) {
      // A new date, time or lead time deserves a new reminder.
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

    const saved =
      dto.groupId === undefined
        ? await this.prisma.client.todo.update({
            where: { id },
            data: updateData,
            include: TODO_INCLUDE,
          })
        : await this.prisma.client.$transaction(async (tx) => {
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
            return updated;
          });

    await this.notifyAfterUpdate(todo, saved, userId, justCompleted);
    return saved;
  }

  /** Tells the people concerned that a collective todo moved; failures stay silent. */
  private async notifyAfterUpdate(
    before: Todo,
    after: Todo & { assigneeId: number | null },
    actorId: number,
    justCompleted: boolean,
  ) {
    if (!this.inbox || before.scope !== TodoScope.COLLECTIVE) return;
    try {
      if (
        after.assigneeId !== null &&
        after.assigneeId !== before.assigneeId &&
        after.assigneeId !== actorId
      ) {
        await this.notifyAssigned(after.assigneeId, after.title, actorId);
      }
      if (justCompleted) {
        const concerned = new Set(
          [after.assigneeId, after.userId].filter(
            (id): id is number => id !== null && id !== actorId,
          ),
        );
        if (concerned.size > 0) {
          const who = await this.displayName(actorId);
          for (const userId of concerned) {
            await this.tell(userId, {
              type: 'todo.completed',
              title: 'Tâche terminée',
              body: `${who} a terminé : ${after.title}`,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error(
        `Could not notify about todo ${after.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Deletes the ticked top-level todos of a tab with their subtasks. A ticked todo that
   * still has an unticked subtask stays: its remaining work would vanish with it.
   */
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
      subtasks: { none: { isCompleted: false } },
      ...(scope === TodoScope.PRIVATE
        ? { userId }
        : { OR: [{ groupId: { in: userGroupIds } }, { groupId: null }] }),
    };
    const doomed = await this.prisma.client.todo.findMany({
      where,
      select: { id: true },
    });
    const ids = doomed.map((t) => t.id);
    const files = await this.attachmentIdsOf(ids);
    const result = await this.prisma.client.todo.deleteMany({
      where: { id: { in: ids } },
    });
    await this.deleteAttachmentFiles(files);
    return result;
  }

  async remove(id: number, userId: number, userRole: string, siteId: number) {
    const todo = await this.findInSite(id, siteId);
    this.assertCanManage(todo, userId, userRole);

    const files = await this.attachmentIdsOf([id]);
    const removed = await this.prisma.client.todo.delete({ where: { id } });
    await this.deleteAttachmentFiles(files);
    return removed;
  }

  /**
   * Sets the manual order of one priority group. Private todos: their owner;
   * collective ones: managers.
   */
  async reorder(
    ids: number[],
    userId: number,
    userRole: string,
    siteId: number,
  ) {
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Duplicate ids');
    }
    const todos = await this.prisma.client.todo.findMany({
      where: { id: { in: ids }, siteId, parentId: null },
      select: { id: true, scope: true, userId: true, priority: true },
    });
    if (todos.length !== ids.length) {
      throw new NotFoundException('Some todos were not found');
    }
    for (const todo of todos) this.assertCanManage(todo, userId, userRole);
    if (new Set(todos.map((t) => t.priority)).size > 1) {
      throw new BadRequestException(
        'Only todos of the same priority can be ordered together',
      );
    }
    await this.prisma.client.$transaction(
      ids.map((id, index) =>
        this.prisma.client.todo.update({
          where: { id },
          data: { position: index + 1 },
        }),
      ),
    );
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Comments
  // ------------------------------------------------------------------

  async listComments(todoId: number, actor: TodoActor) {
    await this.findVisible(todoId, actor);
    return this.prisma.client.todoComment.findMany({
      where: { todoId },
      orderBy: { createdAt: 'asc' },
      include: { user: USER_BRIEF },
    });
  }

  async addComment(todoId: number, body: string, actor: TodoActor) {
    const todo = await this.findVisible(todoId, actor);
    const text = body.trim();
    if (!text) throw new BadRequestException('A comment cannot be empty');
    const comment = await this.prisma.client.todoComment.create({
      data: { todoId, userId: actor.userId, body: text },
      include: { user: USER_BRIEF },
    });
    if (todo.scope === TodoScope.COLLECTIVE) {
      const concerned = new Set(
        [todo.assigneeId, todo.userId].filter(
          (id): id is number => id !== null && id !== actor.userId,
        ),
      );
      const who = comment.user.fullname || comment.user.username;
      for (const userId of concerned) {
        await this.tell(userId, {
          type: 'todo.comment',
          title: 'Nouveau commentaire',
          body: `${who} sur « ${todo.title} » : ${text.slice(0, 120)}`,
        });
      }
    }
    return comment;
  }

  async deleteComment(todoId: number, commentId: number, actor: TodoActor) {
    await this.findVisible(todoId, actor);
    const comment = await this.prisma.client.todoComment.findFirst({
      where: { id: commentId, todoId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== actor.userId && !this.isManager(actor.role)) {
      throw new ForbiddenException('You can only delete your own comments');
    }
    await this.prisma.client.todoComment.delete({ where: { id: commentId } });
    return { success: true };
  }

  // ------------------------------------------------------------------
  // Attachments
  // ------------------------------------------------------------------

  async listAttachments(todoId: number, actor: TodoActor) {
    await this.findVisible(todoId, actor);
    return this.prisma.client.todoAttachment.findMany({
      where: { todoId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        size: true,
        createdAt: true,
        uploader: USER_BRIEF,
      },
    });
  }

  async addAttachment(
    todoId: number,
    file: { buffer: Buffer; originalname?: string },
    actor: TodoActor,
  ) {
    await this.findVisible(todoId, actor);
    const mimeType = detectAttachmentType(file.buffer);
    if (!mimeType || file.buffer.length > ATTACHMENT_MAX_BYTES) {
      throw new BadRequestException('Use a PNG, JPEG, WebP or PDF up to 5 MB');
    }
    const existing = await this.prisma.client.todoAttachment.count({
      where: { todoId },
    });
    if (existing >= ATTACHMENTS_PER_TODO) {
      throw new BadRequestException(
        `A todo holds at most ${ATTACHMENTS_PER_TODO} attachments`,
      );
    }
    const filename =
      basename(file.originalname ?? '')
        .replace(/[\r\n"\\/]/g, '_')
        .slice(0, 255) || 'file';
    const id = randomUUID();
    const path = join(getTodoAttachmentsDir(), id);
    await fs.writeFile(path, file.buffer, { flag: 'wx', mode: 0o600 });
    try {
      return await this.prisma.client.todoAttachment.create({
        data: {
          id,
          todoId,
          uploaderId: actor.userId,
          filename,
          mimeType,
          size: file.buffer.length,
        },
        select: { id: true, filename: true, mimeType: true, size: true },
      });
    } catch (error) {
      await fs.unlink(path).catch(() => undefined);
      throw error;
    }
  }

  async downloadAttachment(
    todoId: number,
    attachmentId: string,
    actor: TodoActor,
  ) {
    await this.findVisible(todoId, actor);
    const attachment = await this.prisma.client.todoAttachment.findFirst({
      where: { id: attachmentId, todoId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const path = join(getTodoAttachmentsDir(), attachment.id);
    try {
      await fs.access(path);
    } catch {
      throw new NotFoundException('Attachment file not found');
    }
    return {
      stream: createReadStream(path),
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    };
  }

  async deleteAttachment(
    todoId: number,
    attachmentId: string,
    actor: TodoActor,
  ) {
    const todo = await this.findVisible(todoId, actor);
    const attachment = await this.prisma.client.todoAttachment.findFirst({
      where: { id: attachmentId, todoId },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    const mayDelete =
      attachment.uploaderId === actor.userId ||
      this.isManager(actor.role) ||
      (todo.scope === TodoScope.PRIVATE && todo.userId === actor.userId);
    if (!mayDelete) {
      throw new ForbiddenException('You can only delete your own attachments');
    }
    await this.prisma.client.todoAttachment.delete({
      where: { id: attachmentId },
    });
    await this.deleteAttachmentFiles([attachmentId]);
    return { success: true };
  }

  private async attachmentIdsOf(todoIds: number[]): Promise<string[]> {
    if (todoIds.length === 0) return [];
    const rows = await this.prisma.client.todoAttachment.findMany({
      where: { todoId: { in: todoIds } },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  /** Best effort: a file that cannot be removed must not undo a deletion that happened. */
  private async deleteAttachmentFiles(ids: string[]) {
    await Promise.all(
      ids.map((id) =>
        fs.unlink(join(getTodoAttachmentsDir(), id)).catch(() => undefined),
      ),
    );
  }

  // ------------------------------------------------------------------
  // Reminder preferences
  // ------------------------------------------------------------------

  async getPreferences(userId: number) {
    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: {
        todoReminderEmail: true,
        todoReminderPush: true,
        todoReminderCollective: true,
      },
    });
    return {
      email: user?.todoReminderEmail ?? false,
      push: user?.todoReminderPush ?? true,
      collective: user?.todoReminderCollective ?? true,
    };
  }

  async updatePreferences(
    userId: number,
    dto: { email?: boolean; push?: boolean; collective?: boolean },
  ) {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: {
        todoReminderEmail: dto.email,
        todoReminderPush: dto.push,
        todoReminderCollective: dto.collective,
      },
    });
    return this.getPreferences(userId);
  }
}
