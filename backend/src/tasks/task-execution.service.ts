import type { Prisma } from '@prisma/client';
import type { ListCorrectiveActionsDto } from './dto/list-corrective-actions.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import { promises as fs } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma';
import { getEvidenceStorageDir } from '../config/app-paths';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';
import { assertExecutionSite, isExecutionManager } from './execution-access';

@Injectable()
export class TaskExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly beneficiary: BeneficiaryResolverService,
  ) {}

  private async accessibleTask(taskId: number, user: JwtPayload) {
    if (user.role === 'GUEST') throw new ForbiddenException();
    const task = await this.prisma.client.task.findFirst({
      where: { id: taskId, deletedAt: null, ...this.prisma.buildSiteFilter() },
      include: { userAssignments: true, groupAssignments: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    assertExecutionSite(this.prisma, task.siteId, user.role);
    if (!isExecutionManager(user.role)) {
      const direct = task.userAssignments.some(
        (item) => item.userId === user.sub,
      );
      const group = task.groupAssignments.length
        ? await this.prisma.client.userGroupMembership.findFirst({
            where: {
              userId: user.sub,
              groupId: {
                in: task.groupAssignments.map((item) => item.groupId),
              },
            },
          })
        : null;
      if (
        !direct &&
        !group &&
        !(await this.beneficiary.isEffectiveBeneficiary(taskId, user.sub))
          .isBeneficiary
      ) {
        throw new ForbiddenException('You are not assigned to this task');
      }
    }
    return task;
  }

  async upload(taskId: number, date: string, buffer: Buffer, user: JwtPayload) {
    const task = await this.accessibleTask(taskId, user);
    if (
      !Array.isArray(task.executionChecklist) ||
      !task.executionChecklist.some(
        (step) =>
          step &&
          typeof step === 'object' &&
          !Array.isArray(step) &&
          step.kind === 'PHOTO',
      )
    ) {
      throw new BadRequestException('This task has no photo checklist step');
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(new Date(date).getTime()) ||
      new Date(date).toISOString().slice(0, 10) !== date
    ) {
      throw new BadRequestException('Evidence date must be YYYY-MM-DD');
    }
    // The controller additionally verifies file type using magic bytes.
    const mimeType = buffer.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
      ? 'image/jpeg'
      : buffer
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'image/png'
        : buffer.toString('ascii', 0, 4) === 'RIFF' &&
            buffer.toString('ascii', 8, 12) === 'WEBP'
          ? 'image/webp'
          : undefined;
    if (!mimeType || buffer.length > 5 * 1024 * 1024)
      throw new BadRequestException('Use a PNG, JPEG or WebP image up to 5 MB');
    const id = randomUUID();
    const path = join(getEvidenceStorageDir(), id);
    await fs.writeFile(path, buffer, { flag: 'wx', mode: 0o600 });
    try {
      return await this.prisma.client.taskEvidence.create({
        data: {
          id,
          taskId,
          instanceDate: new Date(date),
          uploaderId: user.sub,
          mimeType,
          size: buffer.length,
        },
        select: { id: true, mimeType: true, size: true },
      });
    } catch (error) {
      await fs.unlink(path);
      throw error;
    }
  }

  async download(taskId: number, evidenceId: string, user: JwtPayload) {
    await this.accessibleTask(taskId, user);
    const evidence = await this.prisma.client.taskEvidence.findFirst({
      where: { id: evidenceId, taskId },
    });
    if (!evidence) throw new NotFoundException('Evidence not found');
    const path = join(getEvidenceStorageDir(), evidence.id);
    try {
      await fs.access(path);
    } catch {
      throw new NotFoundException('Evidence file not found');
    }
    return {
      stream: createReadStream(path),
      mimeType: evidence.mimeType,
      size: evidence.size,
    };
  }

  async assignees(taskId: number, user: JwtPayload) {
    const task = await this.accessibleTask(taskId, user);
    if (!isExecutionManager(user.role)) throw new ForbiddenException();
    const [users, groups] = await Promise.all([
      this.prisma.client.user.findMany({
        where: {
          deletedAt: null,
          role: { not: 'GUEST' },
          sites: { some: { siteId: task.siteId } },
        },
        select: { id: true, username: true, fullname: true },
        orderBy: { username: 'asc' },
      }),
      this.prisma.client.group.findMany({
        where: { deletedAt: null, siteId: task.siteId },
        select: {
          id: true,
          name: true,
          _count: { select: { members: true } },
        },
        orderBy: { name: 'asc' },
      }),
    ]);
    return {
      users,
      groups: groups.map(({ _count, ...group }) => ({
        ...group,
        memberCount: _count.members,
      })),
    };
  }

  /** The team, plus the user's own membership so the list can tell whether they may act on it. */
  private groupSelect(userId: number) {
    return {
      select: {
        id: true,
        name: true,
        members: { where: { userId }, select: { userId: true } },
      },
    } satisfies Prisma.CorrectiveActionInclude['assigneeGroup'];
  }

  /** Mirrors the rule enforced by `updateAction`, without exposing the team's members. */
  private withCanUpdate<
    T extends {
      assigneeId: number | null;
      assigneeGroup: { id: number; name: string; members: unknown[] } | null;
    },
  >(action: T, user: JwtPayload) {
    const { members, ...group } = action.assigneeGroup ?? {
      members: [],
    };
    return {
      ...action,
      assigneeGroup: action.assigneeGroup ? group : null,
      canUpdate:
        isExecutionManager(user.role) ||
        action.assigneeId === user.sub ||
        members.length > 0,
    };
  }

  /** Actions given to the user directly or to one of their teams. */
  private assignedToUser(userId: number): Prisma.CorrectiveActionWhereInput {
    return {
      OR: [
        { assigneeId: userId },
        { assigneeGroup: { members: { some: { userId } } } },
      ],
    };
  }

  async searchActions(user: JwtPayload, filters: ListCorrectiveActionsDto) {
    const page = filters.page ?? 1;
    const pageSize = 50;
    const search = filters.search?.trim();
    const sites =
      user.role === 'SUPER_ADMIN'
        ? {}
        : { siteId: { in: this.prisma.getUserSiteIds() } };
    const conditions: Prisma.CorrectiveActionWhereInput[] = [
      {
        task: { ...sites, ...this.prisma.buildSiteFilter(), deletedAt: null },
      },
    ];
    if (!isExecutionManager(user.role))
      conditions.push({
        OR: [this.assignedToUser(user.sub), { createdById: user.sub }],
      });
    if (filters.state) conditions.push({ state: filters.state });
    if (filters.mine === 'true') conditions.push(this.assignedToUser(user.sub));
    if (filters.overdueBefore)
      conditions.push({
        state: 'OPEN',
        dueDate: { lt: new Date(`${filters.overdueBefore}T00:00:00.000Z`) },
      });
    if (search)
      conditions.push({
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { task: { name: { contains: search, mode: 'insensitive' } } },
          { assignee: { username: { contains: search, mode: 'insensitive' } } },
          { assignee: { fullname: { contains: search, mode: 'insensitive' } } },
          {
            assigneeGroup: { name: { contains: search, mode: 'insensitive' } },
          },
        ],
      });
    const where: Prisma.CorrectiveActionWhereInput = { AND: conditions };
    const [items, total] = await this.prisma.client.$transaction([
      this.prisma.client.correctiveAction.findMany({
        where,
        include: {
          task: { select: { name: true, siteId: true } },
          assignee: { select: { id: true, username: true, fullname: true } },
          assigneeGroup: this.groupSelect(user.sub),
        },
        orderBy: [
          { dueDate: { sort: 'asc', nulls: 'last' } },
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.client.correctiveAction.count({ where }),
    ]);
    return {
      items: items.map((action) => this.withCanUpdate(action, user)),
      total,
      page,
      pageSize,
    };
  }

  async listActions(user: JwtPayload) {
    const sites =
      user.role === 'SUPER_ADMIN'
        ? {}
        : { siteId: { in: this.prisma.getUserSiteIds() } };
    const actions = await this.prisma.client.correctiveAction.findMany({
      where: {
        task: { ...sites, ...this.prisma.buildSiteFilter(), deletedAt: null },
        ...(!isExecutionManager(user.role)
          ? { OR: [this.assignedToUser(user.sub), { createdById: user.sub }] }
          : {}),
      },
      include: {
        task: { select: { name: true, siteId: true } },
        assignee: { select: { id: true, username: true, fullname: true } },
        assigneeGroup: this.groupSelect(user.sub),
      },
      orderBy: [{ state: 'desc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 500,
    });
    return actions.map((action) => this.withCanUpdate(action, user));
  }

  async updateAction(
    id: number,
    state: 'OPEN' | 'CLOSED',
    resolution: string | undefined,
    user: JwtPayload,
  ) {
    const sites =
      user.role === 'SUPER_ADMIN'
        ? {}
        : { siteId: { in: this.prisma.getUserSiteIds() } };
    const action = await this.prisma.client.correctiveAction.findFirst({
      where: {
        id,
        task: { ...sites, ...this.prisma.buildSiteFilter(), deletedAt: null },
      },
      include: { task: { select: { siteId: true } } },
    });
    if (!action) throw new NotFoundException('Corrective action not found');
    if (
      !isExecutionManager(user.role) &&
      action.assigneeId !== user.sub &&
      !(await this.prisma.client.correctiveAction.count({
        where: { id, ...this.assignedToUser(user.sub) },
      }))
    )
      throw new ForbiddenException(
        'Only the assignee, a member of the assigned team or a manager can update this action',
      );
    if (state === 'CLOSED' && !(resolution ?? action.resolution)?.trim())
      throw new BadRequestException(
        'Describe the resolution before closing this action',
      );
    return this.prisma.client.correctiveAction.update({
      where: { id },
      data: {
        state,
        resolution: resolution?.trim(),
        closedAt: state === 'CLOSED' ? (action.closedAt ?? new Date()) : null,
      },
    });
  }
}
