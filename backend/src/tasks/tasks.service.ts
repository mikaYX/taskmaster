import {
  Injectable,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { ConfigService } from '@nestjs/config';
import { SettingsService } from '../settings/settings.service';
import { formatInTimeZone } from 'date-fns-tz';
import {
  InstanceService,
  VirtualInstance,
  FromCompletionContext,
} from './instance.service';
import {
  CreateTaskDto,
  UpdateTaskDto,
  TaskResponseDto,
  toTaskResponse,
  OverrideOccurrenceDto,
  GetTasksQueryDto,
} from './dto';
import type { JwtPayload } from '../auth/strategies/jwt.strategy';
import { TaskStatus, OverrideAction, Prisma } from '@prisma/client';
import { addMonths } from 'date-fns';

import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditCategory } from '../audit/audit.constants';

import { ProcedureStorageService } from './procedure-storage.service';
import { BeneficiaryResolverService } from '../modules/delegations/beneficiary-resolver.service';

/**
 * Tasks Service.
 *
 * Handles task definition CRUD and assignments.
 * Manages scheduling via SchedulerRegistry.
 */
@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
    private readonly instanceService: InstanceService,
    private readonly auditService: AuditService,
    private readonly procedureStorage: ProcedureStorageService,
    private readonly beneficiaryResolver: BeneficiaryResolverService,
  ) { }

  private readonly includeRelations = {
    userAssignments: {
      include: {
        user: { select: { id: true, username: true, fullname: true } },
      },
    },
    groupAssignments: {
      include: { group: { select: { id: true, name: true } } },
    },
    delegations: {
      include: {
        targetUsers: {
          include: {
            user: { select: { id: true, username: true, fullname: true } },
          },
        },
        targetGroups: {
          include: { group: { select: { id: true, name: true } } },
        },
        delegatedBy: { select: { id: true, username: true, fullname: true } },
      },
    },
  };

  /**
   * Initialize scheduler with active tasks.
   */
  // Simplified Service - No active scheduling
  // Scheduling is now handled by the Global Audit (see AuditScheduler)

  /**
   * Preview instances for a task definition.
   * Does NOT save to DB.
   * Wrapped in try/catch so Docker/fresh DB errors return a clear message to the client.
   */
  async preview(dto: CreateTaskDto): Promise<VirtualInstance[]> {
    try {
      if (dto.recurrenceMode === 'FROM_COMPLETION') {
        const fcEnabled = await this.settings.getRawValue<boolean>(
          'FROM_COMPLETION_ENABLED',
        );
        if (!fcEnabled) {
          throw new BadRequestException('FROM_COMPLETION mode is disabled');
        }
      }

      const task = {
        id: 0,
        periodicity: dto.periodicity,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        activeUntil: null,
        skipWeekends: dto.skipWeekends ?? false,
        skipHolidays: dto.skipHolidays ?? false,

        recurrenceMode: dto.recurrenceMode,
        rrule: dto.rrule,
        timezone: dto.timezone,
        dueOffset: dto.dueOffset,
        useGlobalWindowDefaults: dto.useGlobalWindowDefaults,
        windowStartTime: dto.windowStartTime,
        windowEndTime: dto.windowEndTime,
        isContinuousBlock: dto.isContinuousBlock,
      } as unknown as Parameters<InstanceService['computeInstances']>[0];

      const now = new Date();
      const rangeStart = dto.startDate ? new Date(dto.startDate) : now;
      // Use an arbitrarily long enough period to get 10 instances (e.g. 5 years)
      const rangeEnd = addMonths(rangeStart, 60);
      const country =
        (await this.settings.getRawValue<string>('app.country')) || 'FR';

      const wStart = await this.settings.getRawValue<string>(
        'SCHEDULE_DEFAULT_START_TIME',
      );
      const wEnd = await this.settings.getRawValue<string>(
        'SCHEDULE_DEFAULT_END_TIME',
      );
      const windowDefaults = { start: wStart || '08:00', end: wEnd || '18:00' };

      const iterator = this.instanceService.computeInstances(
        task,
        rangeStart,
        rangeEnd,
        country,
        undefined,
        windowDefaults,
      );

      const instances: VirtualInstance[] = [];
      for (const inst of iterator) {
        instances.push(inst);
        if (instances.length >= 10) break;
      }

      return instances;
    } catch (err: unknown) {
      if (err instanceof BadRequestException) throw err;
      const message =
        err instanceof Error ? err.message : 'Preview failed (see server logs)';
      this.logger.warn(`Task preview failed: ${message}`, err instanceof Error ? err.stack : undefined);
      throw new BadRequestException(
        `Could not generate preview: ${message}`,
      );
    }
  }

  /**
   * Get Operational Board Items (Virtual + Real).
   */
  async getBoardItems(
    startDate: Date,
    endDate: Date,
    userId: number,
    groupIds: number[],
    isAdmin: boolean,
    filterUserId?: number,
    filterGroupId?: number,
    options?: {
      sortBy?: string;
      sortDesc?: boolean;
      page?: number;
      limit?: number;
      status?: string;
      priority?: string;
      project?: string;
      category?: string;
    },
  ): Promise<{ items: import('./dto').BoardItem[]; total: number }> {
    const country =
      (await this.settings.getRawValue<string>('app.country')) || 'FR';

    // === Security & Logic Hardening ===
    // 1. Clamp Future: End date cannot be in the future
    const now = new Date();
    if (endDate > now) {
      endDate = now;
    }

    // 2. Consistency: Start cannot be after End
    if (startDate > endDate) {
      startDate = new Date(endDate); // Copy to avoid ref issues
      startDate.setHours(0, 0, 0, 0); // Default to start of that day
    }

    // 3. Max Range: Limit to 90 days (Defense in depth)
    // 90 days in ms = 90 * 24 * 60 * 60 * 1000
    const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
    const diff = endDate.getTime() - startDate.getTime();
    if (diff > MAX_RANGE_MS) {
      // Keep End (most relevant), adjust Start
      startDate = new Date(endDate.getTime() - MAX_RANGE_MS);
    }

    const whereClause: Prisma.TaskWhereInput = {
      deletedAt: null,
      OR: [{ activeUntil: null }, { activeUntil: { gte: startDate } }],
      ...this.prisma.buildSiteFilter(),
    };

    if (!isAdmin) {
      whereClause.AND = [
        {
          OR: [
            { userAssignments: { some: { userId } } },
            ...(groupIds.length > 0
              ? [{ groupAssignments: { some: { groupId: { in: groupIds } } } }]
              : []),
            {
              delegations: {
                some: {
                  startAt: { lte: new Date() },
                  endAt: { gt: new Date() },
                  OR: [
                    { targetUsers: { some: { userId } } },
                    {
                      targetGroups: {
                        some: { group: { members: { some: { userId } } } },
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
      ];
    } else {
      if (filterUserId !== undefined && !isNaN(filterUserId)) {
        whereClause.AND = [
          {
            OR: [
              { userAssignments: { some: { userId: filterUserId } } },
              {
                groupAssignments: {
                  some: {
                    group: { members: { some: { userId: filterUserId } } },
                  },
                },
              },
              {
                delegations: {
                  some: {
                    startAt: { lte: new Date() },
                    endAt: { gt: new Date() },
                    OR: [
                      { targetUsers: { some: { userId: filterUserId } } },
                      {
                        targetGroups: {
                          some: {
                            group: {
                              members: { some: { userId: filterUserId } },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              },
            ],
          },
        ];
      } else if (filterGroupId !== undefined && !isNaN(filterGroupId)) {
        whereClause.AND = [
          { groupAssignments: { some: { groupId: filterGroupId } } },
        ];
      }
    }

    if (options?.priority) {
      whereClause.priority = options.priority;
    }
    if (options?.project) {
      whereClause.project = { contains: options.project, mode: 'insensitive' };
    }
    if (options?.category) {
      whereClause.category = {
        contains: options.category,
        mode: 'insensitive',
      };
    }

    const tasks = await this.prisma.client.task.findMany({
      where: whereClause,
      include: {
        userAssignments: {
          include: {
            user: { select: { id: true, username: true, fullname: true } },
          },
        },
        groupAssignments: {
          include: {
            group: { select: { id: true, name: true } },
          },
        },
        overrides: {
          where: {
            OR: [
              { originalDate: { gte: startDate, lte: endDate } },
              { targetDate: { gte: startDate, lte: endDate } },
            ],
          },
        },
      },
    });

    // Fetch statuses over the extended generation window (startDate - 31 days) so that
    // instances whose occurrence date falls before the view range but whose period
    // overlaps it (e.g. weekly tasks) correctly pick up their MISSING/SUCCESS status.
    const statusFetchStart = new Date(
      startDate.getTime() - 31 * 24 * 60 * 60 * 1000,
    );
    const statuses = await this.prisma.client.status.findMany({
      where: {
        instanceDate: { gte: statusFetchStart, lte: endDate },
      },
      include: {
        updatedBy: { select: { username: true, fullname: true } },
      },
    });

    const statusMap = new Map<string, (typeof statuses)[0]>();
    statuses.forEach((s: any) => {
      // s.instanceDate IS a Prisma Date (Midnight UTC matching the written date)
      // So toISOString().split('T')[0] works perfectly to extract 'YYYY-MM-DD'.
      const key = `${s.taskId}_${s.instanceDate.toISOString().split('T')[0]}`;
      statusMap.set(key, s);
    });

    let boardItems: import('./dto').BoardItem[] = [];

    const fcEnabled = await this.settings.getRawValue<boolean>(
      'FROM_COMPLETION_ENABLED',
    );
    const wStart = await this.settings.getRawValue<string>(
      'SCHEDULE_DEFAULT_START_TIME',
    );
    const wEnd = await this.settings.getRawValue<string>(
      'SCHEDULE_DEFAULT_END_TIME',
    );
    const windowDefaults = { start: wStart || '08:00', end: wEnd || '18:00' };

    for (const task of tasks) {
      let fromCompletionCtx: FromCompletionContext | undefined;

      // Build FROM_COMPLETION context only when feature flag is ON
      if (
        fcEnabled &&
        task.recurrenceMode === 'FROM_COMPLETION' &&
        task.rrule
      ) {
        const lastTerminal = await this.prisma.client.status.findFirst({
          where: {
            taskId: task.id,
            status: { in: ['SUCCESS', 'FAILED'] },
          },
          orderBy: { updatedAt: 'desc' },
        });

        const hasRunning =
          (await this.prisma.client.status.count({
            where: {
              taskId: task.id,
              status: 'RUNNING',
              instanceDate: { gte: startDate, lte: endDate },
            },
          })) > 0;

        fromCompletionCtx = {
          lastTerminalDate: lastTerminal?.updatedAt ?? null,
          hasRunningInstance: hasRunning,
        };
      }

      // On remonte de 31 jours pour capturer les tâches en cours à cheval sur la fenêtre
      const generationStart = new Date(
        startDate.getTime() - 31 * 24 * 60 * 60 * 1000,
      );

      const instances = this.instanceService.computeInstances(
        task as unknown as Parameters<InstanceService['computeInstances']>[0],
        generationStart,
        endDate,
        country,
        fromCompletionCtx,
        windowDefaults,
      );

      for (const inst of instances) {
        const tz = task.timezone || 'UTC';
        // Format the date using task's timezone instead of applying UTC `.toISOString()` blindly
        const instanceDateStr = formatInTimeZone(inst.date, tz, 'yyyy-MM-dd');
        const originalDateStr = formatInTimeZone(inst.originalDate, tz, 'yyyy-MM-dd');

        const key = `${task.id}_${instanceDateStr}`;
        const status = statusMap.get(key);

        const pStart = inst.periodStart ?? inst.date;
        const pEnd = inst.periodEnd ?? inst.date;
        // Garde l'instance si sa période chevauche [startDate, endDate]
        if (pEnd < startDate || pStart > endDate) continue;

        boardItems.push({
          taskId: task.id,
          taskName: task.name,
          description: task.description ?? undefined,
          priority: task.priority ?? undefined,
          project: task.project ?? undefined,
          category: task.category ?? undefined,
          periodicity: task.periodicity,
          procedureUrl: task.procedureUrl ?? undefined,
          instanceDate: instanceDateStr,
          originalDate: originalDateStr,
          periodStart: inst.periodStart?.toISOString() || inst.date.toISOString(),
          periodEnd: inst.periodEnd?.toISOString() || inst.date.toISOString(),
          isShifted: instanceDateStr !== originalDateStr || inst.date.getTime() !== inst.originalDate.getTime(),
          status: status ? status.status : 'RUNNING',
          validation: status
            ? {
              byUserId: status.updatedByUserId ?? 0,
              byUsername:
                status.updatedBy?.username ??
                status.updatedByUsername ??
                'unknown',
              validatedAt: status.updatedAt.toISOString(),
              comment: status.comment ?? undefined,
            }
            : undefined,
          isException: inst.isException,
          originalInstanceDate: inst.isException ? originalDateStr : undefined,
          assignedUsers: task.userAssignments.map((u: any) => ({
            id: u.user.id,
            name: u.user.fullname || u.user.username,
          })),
          assignedGroups: task.groupAssignments.map((g: any) => ({
            id: g.group.id,
            name: g.group.name,
          })),
        });
      }
    }

    // Filtrage statut en mémoire (statut réel basé sur occurence)
    if (options?.status) {
      boardItems = boardItems.filter((i) => i.status === options.status);
    }

    // Tri en mémoire
    if (options?.sortBy) {
      boardItems.sort((a, b) => {
        let valA: any = a[options.sortBy as keyof typeof a];
        let valB: any = b[options.sortBy as keyof typeof b];

        // Pour les noms assignés au lieu de l'array
        if (options.sortBy === 'assignee') {
          valA = a.assignedUsers[0]?.name || '';
          valB = b.assignedUsers[0]?.name || '';
        }

        if (valA < valB) return options.sortDesc ? 1 : -1;
        if (valA > valB) return options.sortDesc ? -1 : 1;
        return 0;
      });
    } else {
      boardItems.sort((a, b) => a.instanceDate.localeCompare(b.instanceDate));
    }

    const total = boardItems.length;

    // Pagination en mémoire
    if (options?.page !== undefined && options?.limit !== undefined) {
      const startIndex = (options.page - 1) * options.limit;
      boardItems = boardItems.slice(startIndex, startIndex + options.limit);
    }

    return { items: boardItems, total };
  }

  async findMissingTasks(
    userId: number,
    options?: { limit?: number; onlyUrgent?: boolean },
  ) {
    const whereClause: Prisma.StatusWhereInput = {
      status: 'MISSING',
      task: {
        deletedAt: null,
        ...this.prisma.buildSiteFilter(),
        OR: [
          { userAssignments: { some: { userId } } },
          {
            groupAssignments: {
              some: { group: { members: { some: { userId } } } },
            },
          },
          {
            delegations: {
              some: {
                startAt: { lte: new Date() },
                endAt: { gt: new Date() },
                OR: [
                  { targetUsers: { some: { userId } } },
                  {
                    targetGroups: {
                      some: { group: { members: { some: { userId } } } },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    if (options?.onlyUrgent) {
      const threeDaysAgo = require('date-fns').subDays(new Date(), 3);
      whereClause.instanceDate = { lt: threeDaysAgo };
    }

    const missingStatuses = await this.prisma.client.status.findMany({
      where: whereClause,
      orderBy: { instanceDate: 'asc' },
      take: options?.limit || 50,
      include: {
        task: {
          select: { id: true, name: true, periodicity: true },
        },
      },
    });

    this.logger.warn(
      `Found ${missingStatuses.length} missing tasks for user ${userId}`,
    );

    return missingStatuses.map((s: any) => ({
      id: s.taskId,
      statusId: s.id,
      title: s.task.name,
      dueDate: s.instanceDate,
      periodicity: s.task.periodicity,
    }));
  }

  async getMissingTasksCount(userId: number): Promise<number> {
    const whereClause: Prisma.StatusWhereInput = {
      status: 'MISSING',
      task: {
        deletedAt: null,
        ...this.prisma.buildSiteFilter(),
        OR: [
          { userAssignments: { some: { userId } } },
          {
            groupAssignments: {
              some: { group: { members: { some: { userId } } } },
            },
          },
          {
            delegations: {
              some: {
                startAt: { lte: new Date() },
                endAt: { gt: new Date() },
                OR: [
                  { targetUsers: { some: { userId } } },
                  {
                    targetGroups: {
                      some: { group: { members: { some: { userId } } } },
                    },
                  },
                ],
              },
            },
          },
        ],
      },
    };

    return this.prisma.client.status.count({ where: whereClause });
  }

  async getArchivedTasks() {
    return this.prisma.client.task.findMany({
      where: { deletedAt: { not: null }, ...this.prisma.buildSiteFilter() },
      orderBy: { deletedAt: 'desc' },
      include: this.includeRelations,
    });
  }

  async findAll(
    query: GetTasksQueryDto,
    user: JwtPayload,
  ): Promise<TaskResponseDto[]> {
    const whereAnd: Prisma.TaskWhereInput[] = [
      { deletedAt: null },
      this.prisma.buildSiteFilter(),
    ];

    if (query.status === 'active') {
      whereAnd.push({
        OR: [{ activeUntil: null }, { activeUntil: { gte: new Date() } }],
      });
    } else if (query.status === 'inactive') {
      whereAnd.push({ activeUntil: { lt: new Date() } });
    } else if (!query.includeInactive) {
      whereAnd.push({
        OR: [{ activeUntil: null }, { activeUntil: { gte: new Date() } }],
      });
    }

    if (user.role === 'USER' || user.role === 'GUEST') {
      whereAnd.push({
        OR: [
          { userAssignments: { some: { userId: user.sub } } },
          {
            groupAssignments: {
              some: { group: { members: { some: { userId: user.sub } } } },
            },
          },
          {
            delegations: {
              some: {
                startAt: { lte: new Date() },
                endAt: { gt: new Date() },
                OR: [
                  { targetUsers: { some: { userId: user.sub } } },
                  {
                    targetGroups: {
                      some: {
                        group: { members: { some: { userId: user.sub } } },
                      },
                    },
                  },
                ],
              },
            },
          },
        ],
      });
    } else {
      // SUPER_ADMIN / MANAGER : filtres globaux autorisés
      if (query.filterUserId) {
        whereAnd.push({
          userAssignments: { some: { userId: query.filterUserId } },
        });
      }
      if (query.filterGroupId) {
        whereAnd.push({
          groupAssignments: { some: { groupId: query.filterGroupId } },
        });
      }
    }

    const where: Prisma.TaskWhereInput = { AND: whereAnd };

    const tasks = await this.prisma.client.task.findMany({
      where,
      include: this.includeRelations,
      orderBy: { id: 'asc' },
    });
    return tasks.map(toTaskResponse);
  }

  async findOne(id: number): Promise<TaskResponseDto> {
    const task = await this.prisma.client.task.findUnique({
      where: { id },
      include: this.includeRelations,
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
    return toTaskResponse(task);
  }

  async create(dto: CreateTaskDto): Promise<TaskResponseDto> {
    // === Recurrence Mode Validation ===
    if (dto.recurrenceMode === 'FROM_COMPLETION') {
      const fcEnabled = await this.settings.getRawValue<boolean>(
        'FROM_COMPLETION_ENABLED',
      );

      if (!fcEnabled) {
        throw new BadRequestException('FROM_COMPLETION mode is disabled');
      }

      if (!dto.rrule) {
        throw new BadRequestException('FROM_COMPLETION mode requires an rrule');
      }
    }

    // === Scheduling Window V2 Validation ===
    if (dto.useGlobalWindowDefaults === false) {
      if (!dto.windowStartTime || !dto.windowEndTime) {
        throw new BadRequestException(
          'When overriding global window defaults, start and end times are required.',
        );
      }
    }

    const task = await this.prisma.client.task.create({
      data: {
        name: dto.name,
        priority: dto.priority ?? 'MEDIUM',
        project: dto.project ?? null,
        category: dto.category ?? null,
        periodicity: dto.periodicity,
        description: dto.description,
        procedureUrl: dto.procedureUrl,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : null,
        skipWeekends: dto.skipWeekends ?? true,
        skipHolidays: dto.skipHolidays ?? true,
        siteId: this.prisma.getDefaultSiteId() ?? 1,

        userAssignments: dto.userIds?.length
          ? { createMany: { data: dto.userIds.map((userId) => ({ userId })) } }
          : undefined,
        groupAssignments: dto.groupIds?.length
          ? {
            createMany: {
              data: dto.groupIds.map((groupId) => ({ groupId })),
            },
          }
          : undefined,
        recurrenceMode: dto.recurrenceMode ?? 'ON_SCHEDULE', // Default to ON_SCHEDULE
        rrule: dto.rrule,
        timezone: dto.timezone,
        dueOffset: dto.dueOffset,
        useGlobalWindowDefaults: dto.useGlobalWindowDefaults ?? true,
        windowStartTime:
          dto.useGlobalWindowDefaults === false ? dto.windowStartTime : null,
        windowEndTime:
          dto.useGlobalWindowDefaults === false
            ? (dto.windowEndTime ?? null)
            : null,
        isContinuousBlock: dto.isContinuousBlock ?? false,
      } as unknown as Prisma.TaskCreateInput,
      include: this.includeRelations,
    });

    this.logger.log(`Created task ${task.id}: ${task.name}`);

    return toTaskResponse(task);
  }

  async update(
    id: number,
    dto: UpdateTaskDto,
    actor?: { id: number; username: string },
  ): Promise<TaskResponseDto> {
    // await this.verifyExists(id); // Use findUnique to get task for logic check
    const task = await this.prisma.client.task.findUnique({
      where: { id },
      include: this.includeRelations,
    });

    if (!task) throw new NotFoundException(`Task ${id} not found`);

    const fcEnabled = await this.settings.getRawValue<boolean>(
      'FROM_COMPLETION_ENABLED',
    );

    // P6.2 V2 Logic / Migration
    const updates = { ...dto } as unknown as Omit<
      UpdateTaskDto,
      | 'windowStartTime'
      | 'windowEndTime'
      | 'rrule'
      | 'timezone'
      | 'dueOffset'
      | 'recurrenceMode'
    > & {
      windowStartTime?: string | null;
      windowEndTime?: string | null;
      rrule?: string | null;
      timezone?: string;
      dueOffset?: number | null;
      recurrenceMode?: string;
      isContinuousBlock?: boolean;
    };

    // V2 Validation
    if (updates.recurrenceMode === 'FROM_COMPLETION') {
      if (!fcEnabled) {
        throw new BadRequestException('FROM_COMPLETION mode is disabled');
      }
      // Check if rrule is provided in update OR exists in task
      if (!updates.rrule && !task.rrule) {
        throw new BadRequestException('FROM_COMPLETION mode requires an rrule');
      }
    }

    if (updates.rrule || updates.timezone || updates.dueOffset !== undefined) {
      // Keep existing recurrenceMode if provided, default to ON_SCHEDULE for new V2 tasks
      if (!updates.recurrenceMode && !task.recurrenceMode) {
        updates.recurrenceMode = 'ON_SCHEDULE';
      }
    }

    // === Scheduling Window V2 Validation ===
    const useGlobal =
      updates.useGlobalWindowDefaults !== undefined
        ? updates.useGlobalWindowDefaults
        : task.useGlobalWindowDefaults;

    if (useGlobal === false) {
      const start =
        updates.windowStartTime !== undefined
          ? updates.windowStartTime
          : task.windowStartTime;
      const end =
        updates.windowEndTime !== undefined
          ? updates.windowEndTime
          : task.windowEndTime;

      if (!start || !end) {
        throw new BadRequestException(
          'Both start and end time must be present when overriding global window defaults.',
        );
      }
      updates.windowStartTime = start;
      updates.windowEndTime = end;
    } else if (useGlobal === true) {
      updates.windowStartTime = null;
      updates.windowEndTime = null;
    }

    // === Procedure Upload Cleanup ===
    if (
      updates.procedureUrl !== undefined &&
      task.procedureUrl?.startsWith('local:') &&
      updates.procedureUrl !== task.procedureUrl
    ) {
      // Clean up the specific old file physically when replaced
      await this.procedureStorage.deleteSpecificFile(
        task.procedureUrl.replace('local:', ''),
      );
    }

    const updated = await this.prisma.client.task.update({
      where: { id },
      data: {
        name: updates.name,
        priority: updates.priority,
        project: updates.project,
        category: updates.category,
        periodicity: updates.periodicity,
        description: updates.description,
        procedureUrl: updates.procedureUrl,
        startDate: updates.startDate ? new Date(updates.startDate) : undefined,
        endDate: updates.endDate ? new Date(updates.endDate) : undefined,
        skipWeekends: updates.skipWeekends,
        skipHolidays: updates.skipHolidays,

        recurrenceMode: updates.recurrenceMode,
        rrule: updates.rrule,
        timezone: updates.timezone,
        dueOffset: updates.dueOffset,
        useGlobalWindowDefaults: updates.useGlobalWindowDefaults,
        windowStartTime: updates.windowStartTime as unknown as string,
        windowEndTime: updates.windowEndTime as unknown as string,
        isContinuousBlock: updates.isContinuousBlock,
      } as unknown as Prisma.TaskUpdateInput,
      include: this.includeRelations,
    });

    if (actor) {
      await this.auditService.logDiff({
        action: AuditAction.TASK_UPDATED,
        actor,
        target: `Task:${id}`,
        category: AuditCategory.TASK,
        before: task,
        after: updated,
      });
    }

    this.logger.log(`Updated task ${id}`);
    return toTaskResponse(
      updated as unknown as Parameters<typeof toTaskResponse>[0],
    );
  }

  /** Deactivate task (soft delete via activeUntil). */
  async deactivate(id: number): Promise<TaskResponseDto> {
    await this.verifyExists(id);
    const task = await this.prisma.client.task.update({
      where: { id },
      data: { activeUntil: new Date() },
      include: this.includeRelations,
    });

    this.logger.log(`Deactivated task ${id}`);

    return toTaskResponse(task);
  }

  /** Soft delete task. */
  async softDelete(taskId: number, userId: number): Promise<void> {
    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
      include: {
        userAssignments: true,
        groupAssignments: {
          include: { group: { include: { members: true } } },
        },
        delegations: true,
      },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (task.deletedAt) {
      throw new BadRequestException('Task is already deleted');
    }

    // Avertir si task a des assignations/délégations actives
    const hasActiveAssignments =
      (task as any).userAssignments.length > 0 ||
      (task as any).groupAssignments.length > 0;
    const hasActiveDelegations = (task as any).delegations.length > 0;

    if (hasActiveAssignments || hasActiveDelegations) {
      this.logger.warn(
        `Deleting task ${taskId} with active assignments/delegations`,
      );
    }

    await this.prisma.client.task.update({
      where: { id: taskId },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    this.logger.log(`Task ${taskId} soft deleted by user ${userId}`);
  }

  /** Restore soft-deleted task. */
  async restore(taskId: number, userId: number) {
    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException(`Task with ID ${taskId} not found`);
    }

    if (!task.deletedAt) {
      throw new BadRequestException('Task is not deleted');
    }

    const daysSinceDelete = Math.floor(
      (Date.now() - task.deletedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceDelete > 30) {
      throw new BadRequestException(
        'Cannot restore task deleted more than 30 days ago',
      );
    }

    const restored = await this.prisma.client.task.update({
      where: { id: taskId },
      data: {
        deletedAt: null,
        deletedBy: null,
      },
    });

    this.logger.log(`Task ${taskId} restored by user ${userId}`);
    return restored;
  }

  /** Hard delete task. */
  async hardDelete(taskId: number): Promise<void> {
    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
    });

    if (!task || !task.deletedAt) {
      throw new BadRequestException('Task must be soft deleted first');
    }

    const daysSinceDelete = Math.floor(
      (Date.now() - task.deletedAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceDelete < 30) {
      throw new BadRequestException(
        'Task can only be permanently deleted after 30 days',
      );
    }

    if (task.procedureUrl?.startsWith('local:')) {
      await this.procedureStorage.deleteSpecificFile(
        task.procedureUrl.replace('local:', ''),
      );
    }

    await this.prisma.client.$transaction([
      this.prisma.client.status.deleteMany({ where: { taskId } }),
      this.prisma.client.taskAssignment.deleteMany({ where: { taskId } }),
      this.prisma.client.taskGroupAssignment.deleteMany({ where: { taskId } }),
      this.prisma.client.taskDelegation.deleteMany({ where: { taskId } }),
      this.prisma.client.task.delete({ where: { id: taskId } }),
    ]);

    this.logger.log(`Task ${taskId} permanently deleted`);
  }

  /** Reactivate task (clear activeUntil). */
  async reactivate(id: number): Promise<TaskResponseDto> {
    await this.verifyExists(id);
    const task = await this.prisma.client.task.update({
      where: { id },
      data: { activeUntil: null },
      include: this.includeRelations,
    });

    this.logger.log(`Reactivated task ${id}`);

    return toTaskResponse(task);
  }

  /** Run task immediately (V1 DRY_RUN mode). */
  async run(
    id: number,
  ): Promise<{ success: boolean; message: string; mode: string }> {
    await this.verifyExists(id);
    // V1 Freeze: Force DRY_RUN mode
    this.logger.log(`[DRY_RUN] Manually simulating task ${id}`);
    return {
      success: true,
      message: `Execution engine deactivated for V1. This is a simulated DRY_RUN for task ${id}.`,
      mode: 'DRY_RUN',
    };
  }

  // === Occurrence Overrides ===

  async upsertOccurrenceOverride(
    taskId: number,
    dto: OverrideOccurrenceDto,
    actor: { id: number; username: string },
  ) {
    const flag = await this.settings.getRawValue<boolean>(
      'TASK_OCCURRENCE_OVERRIDES_ENABLED',
    );
    if (!flag) {
      throw new BadRequestException('Single occurrence overrides are disabled');
    }

    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (task.recurrenceMode === 'FROM_COMPLETION') {
      throw new BadRequestException(
        'Cannot override occurrences for FROM_COMPLETION tasks',
      );
    }

    if (dto.action === 'MOVE' && !dto.targetDate) {
      throw new BadRequestException(
        'targetDate is required when action is MOVE',
      );
    }
    if (dto.action === 'SKIP' && dto.targetDate !== undefined) {
      throw new BadRequestException(
        'targetDate must not be provided when action is SKIP',
      );
    }

    const originalDate = new Date(dto.originalDate);
    const targetDate =
      dto.action === 'MOVE' && dto.targetDate ? new Date(dto.targetDate) : null;

    const existing = await this.prisma.client.taskOccurrenceOverride.findUnique(
      {
        where: { taskId_originalDate: { taskId, originalDate } },
      },
    );

    const override = await this.prisma.client.taskOccurrenceOverride.upsert({
      where: {
        taskId_originalDate: { taskId, originalDate },
      },
      create: {
        taskId,
        originalDate,
        action: dto.action as OverrideAction,
        targetDate,
        reason: dto.reason,
      },
      update: {
        action: dto.action as OverrideAction,
        targetDate,
        reason: dto.reason,
      },
    });

    await this.auditService.logDiff({
      action: existing ? AuditAction.TASK_UPDATED : AuditAction.TASK_CREATED,
      actor,
      target: `Task:${taskId}`,
      category: AuditCategory.TASK,
      before: existing,
      after: override,
    });

    return override;
  }

  async deleteOccurrenceOverride(
    taskId: number,
    originalDateStr: string,
    actor: { id: number; username: string },
  ) {
    const flag = await this.settings.getRawValue<boolean>(
      'TASK_OCCURRENCE_OVERRIDES_ENABLED',
    );
    if (!flag) {
      throw new BadRequestException('Single occurrence overrides are disabled');
    }

    const originalDate = new Date(originalDateStr);
    if (isNaN(originalDate.getTime())) {
      throw new BadRequestException('Invalid originalDate format');
    }

    const existing = await this.prisma.client.taskOccurrenceOverride.findUnique(
      {
        where: { taskId_originalDate: { taskId, originalDate } },
      },
    );

    if (!existing) {
      return; // Idempotent
    }

    await this.prisma.client.taskOccurrenceOverride.delete({
      where: { taskId_originalDate: { taskId, originalDate } },
    });

    await this.auditService.logDiff({
      action: AuditAction.TASK_DELETED,
      actor,
      target: `Task:${taskId}`,
      category: AuditCategory.TASK,
      before: existing,
      after: null,
    });
  }

  // === Assignments ===

  async addUserAssignments(
    taskId: number,
    userIds: number[],
  ): Promise<TaskResponseDto> {
    await this.verifyExists(taskId);
    await this.prisma.client.taskAssignment.createMany({
      data: userIds.map((userId) => ({ taskId, userId })),
      skipDuplicates: true,
    });
    return this.findOne(taskId);
  }

  async removeUserAssignments(
    taskId: number,
    userIds: number[],
  ): Promise<TaskResponseDto> {
    await this.verifyExists(taskId);
    await this.prisma.client.taskAssignment.deleteMany({
      where: { taskId, userId: { in: userIds } },
    });
    return this.findOne(taskId);
  }

  async addGroupAssignments(
    taskId: number,
    groupIds: number[],
  ): Promise<TaskResponseDto> {
    await this.verifyExists(taskId);
    await this.prisma.client.taskGroupAssignment.createMany({
      data: groupIds.map((groupId) => ({ taskId, groupId })),
      skipDuplicates: true,
    });
    return this.findOne(taskId);
  }

  async removeGroupAssignments(
    taskId: number,
    groupIds: number[],
  ): Promise<TaskResponseDto> {
    await this.verifyExists(taskId);
    await this.prisma.client.taskGroupAssignment.deleteMany({
      where: { taskId, groupId: { in: groupIds } },
    });
    return this.findOne(taskId);
  }

  async count(): Promise<{ total: number; active: number }> {
    const siteFilter = this.prisma.buildSiteFilter();
    const [total, active] = await Promise.all([
      this.prisma.client.task.count({ where: { ...siteFilter } }),
      this.prisma.client.task.count({
        where: {
          OR: [{ activeUntil: null }, { activeUntil: { gte: new Date() } }],
          ...siteFilter,
        },
      }),
    ]);
    return { total, active };
  }

  // === Status Management ===

  async setStatus(
    taskId: number,
    dto: {
      date: string;
      status: 'SUCCESS' | 'FAILED' | 'MISSING' | 'RUNNING';
      comment?: string;
    },
    userId: number,
    userRole: string,
  ) {
    await this.verifyExists(taskId);

    const date = new Date(dto.date);

    // Fetch task and compute instance to check window boundaries
    const task = await this.prisma.client.task.findUnique({
      where: { id: taskId },
      include: this.includeRelations,
    });

    if (task) {
      const defaultCountry =
        (await this.settings.getRawValue<string>('app.country')) || 'FR';
      const wStart = await this.settings.getRawValue<string>(
        'SCHEDULE_DEFAULT_START_TIME',
      );
      const wEnd = await this.settings.getRawValue<string>(
        'SCHEDULE_DEFAULT_END_TIME',
      );
      const windowDefaults = { start: wStart || '08:00', end: wEnd || '18:00' };

      const instances = Array.from(
        this.instanceService.computeInstances(
          task as unknown as Prisma.TaskGetPayload<object>,
          date,
          date,
          defaultCountry,
          undefined,
          windowDefaults,
        ),
      );

      const instance = instances.find(
        (i) =>
          i.date.toISOString().split('T')[0] ===
          date.toISOString().split('T')[0],
      );
      const periodEnd =
        instance?.periodEnd ||
        new Date(new Date(date).setHours(23, 59, 59, 999));

      // Seuls ADMIN et MANAGER peuvent modifier le statut après expiration de la fenêtre
      const canBypassExpiredWindow = userRole === 'ADMIN' || userRole === 'MANAGER';
      if (!canBypassExpiredWindow && new Date() > periodEnd) {
        throw new BadRequestException(
          'The scheduling window for this task has expired.',
        );
      }
    }

    // Check existing status for permission control
    const existing = await this.prisma.client.status.findUnique({
      where: { taskId_instanceDate: { taskId, instanceDate: date } },
    });

    const terminalStatuses: string[] = ['SUCCESS', 'FAILED', 'MISSING'];

    if (userRole !== 'ADMIN') {
      // USER can only change RUNNING tasks to SUCCESS/FAILED
      if (existing && terminalStatuses.includes(existing.status)) {
        throw new BadRequestException(
          'Only an admin can modify a completed task status',
        );
      }
      if (!['SUCCESS', 'FAILED'].includes(dto.status)) {
        throw new BadRequestException(
          'Users can only set status to SUCCESS or FAILED',
        );
      }

      // Authorization Check
      const _task = task as any;
      const hasDirectAssignment = _task?.userAssignments?.some(
        (ua: any) => ua.userId === userId,
      );

      let hasGroupAssignment = false;
      if (_task && _task.groupAssignments?.length > 0) {
        const groupIds = _task.groupAssignments.map((ga: any) => ga.groupId);
        const membership =
          await this.prisma.client.userGroupMembership.findFirst({
            where: { userId, groupId: { in: groupIds } },
          });
        hasGroupAssignment = !!membership;
      }

      let isBeneficiary = false;
      let resolutionMode = 'none';
      let delegationId: number | undefined;

      if (!hasDirectAssignment && !hasGroupAssignment) {
        const beneficiaryCheck =
          await this.beneficiaryResolver.isEffectiveBeneficiary(taskId, userId);
        isBeneficiary = beneficiaryCheck.isBeneficiary;
        resolutionMode = beneficiaryCheck.resolutionMode;
        delegationId = beneficiaryCheck.delegationId;

        if (!isBeneficiary) {
          throw new BadRequestException(
            'You do not have permission to update this task status',
          );
        }
      }

      // If authorized via delegation, log explicitly
      if (isBeneficiary && delegationId) {
        const userInfos = await this.prisma.client.user.findUnique({
          where: { id: userId },
          select: { username: true },
        });
        await this.auditService.log({
          action: 'TASK_STATUS_UPDATED',
          category: AuditCategory.TASK,
          actorId: userId,
          actorName: userInfos?.username ?? 'System',
          target: String(taskId),
          details: {
            message: 'Status updated via delegation',
            delegationId,
            resolutionMode,
            status: dto.status,
          },
        });
      }
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      select: { username: true },
    });

    const status = await this.prisma.client.status.upsert({
      where: {
        taskId_instanceDate: { taskId, instanceDate: date },
      },
      create: {
        taskId,
        instanceDate: date,
        status: dto.status as TaskStatus,
        comment: dto.comment,
        updatedByUserId: userId,
        updatedByUsername: user?.username ?? 'unknown',
      },
      update: {
        status: dto.status as TaskStatus,
        comment: dto.comment,
        updatedByUserId: userId,
        updatedByUsername: user?.username ?? 'unknown',
      },
    });

    this.logger.log(
      `Set status ${dto.status} for task ${taskId} on ${dto.date} by user ${userId} (role: ${userRole})`,
    );
    return status;
  }

  private async verifyExists(id: number): Promise<void> {
    const task = await this.prisma.client.task.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!task) throw new NotFoundException(`Task ${id} not found`);
  }
}
