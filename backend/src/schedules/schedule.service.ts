import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma';
import { SettingsService } from '../settings/settings.service';
import {
  CreateScheduleDto,
  UpdateScheduleDto,
  ScheduleResponseDto,
  BulkCreateResponseDto,
  toScheduleResponse,
} from './dto';

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async assertBulkEnabled(): Promise<void> {
    // Schedule entity is now core, always enabled.
    const bulkEnabled = await this.settings.getRawValue<boolean>(
      'SCHEDULE_BULK_ENABLED',
    );
    if (!bulkEnabled) {
      throw new BadRequestException(
        'Bulk schedule creation is not enabled. Set SCHEDULE_BULK_ENABLED to true.',
      );
    }
  }

  async createBulk(items: CreateScheduleDto[]): Promise<BulkCreateResponseDto> {
    await this.assertBulkEnabled();

    const correlationId = randomUUID();
    const start = Date.now();

    const taskIds = items.map((i) => i.taskId);
    const uniqueTaskIds = new Set(taskIds);
    if (uniqueTaskIds.size !== taskIds.length) {
      throw new BadRequestException('Duplicate taskId in bulk request');
    }

    const existingTasks = await this.prisma.client.task.findMany({
      where: { id: { in: [...uniqueTaskIds] } },
      select: { id: true },
    });
    const existingIds = new Set(existingTasks.map((t) => t.id));
    for (const id of uniqueTaskIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundException(`Task ${id} not found`);
      }
    }

    const created = await this.prisma.client.$transaction(
      items.map((dto) =>
        this.prisma.client.schedule.create({
          data: {
            taskId: dto.taskId,
            recurrenceMode: dto.recurrenceMode,
            rrule: dto.rrule,
            timezone: dto.timezone ?? 'UTC',
            openOffset: dto.openOffset ?? 0,
            closeOffset: dto.closeOffset,
            dueOffset: dto.dueOffset,
            maxOccurrences: dto.maxOccurrences,
            endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
            siteId: (() => {
              const resolved = dto.siteId ?? this.prisma.getDefaultSiteId();
              if (!resolved) {
                throw new BadRequestException(
                  `Cannot create schedule for task ${dto.taskId}: no siteId provided and no default site found.`,
                );
              }
              return resolved;
            })(),
            label: dto.label,
          },
        }),
      ),
    );

    const duration = Date.now() - start;
    this.logger.log({
      message: 'Bulk schedule creation completed',
      correlationId,
      createdCount: created.length,
      ids: created.map((s) => s.id),
      durationMs: duration,
    });

    return { createdCount: created.length, ids: created.map((s) => s.id) };
  }

  async create(dto: CreateScheduleDto): Promise<ScheduleResponseDto> {
    // Core feature: always enabled

    const task = await this.prisma.client.task.findUnique({
      where: { id: dto.taskId },
    });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);

    const schedule = await this.prisma.client.schedule.create({
      data: {
        taskId: dto.taskId,
        recurrenceMode: dto.recurrenceMode,
        rrule: dto.rrule,
        timezone: dto.timezone ?? 'UTC',
        openOffset: dto.openOffset ?? 0,
        closeOffset: dto.closeOffset,
        dueOffset: dto.dueOffset,
        maxOccurrences: dto.maxOccurrences,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        siteId: (() => {
          const resolved = dto.siteId ?? this.prisma.getDefaultSiteId();
          if (!resolved) {
            throw new BadRequestException(
              `Cannot create schedule for task ${dto.taskId}: no siteId provided and no default site found.`,
            );
          }
          return resolved;
        })(),
        label: dto.label,
      },
    });

    this.logger.log(`Created schedule ${schedule.id} for task ${dto.taskId}`);
    return toScheduleResponse(schedule);
  }

  async findAll(filters: {
    taskId?: number;
    status?: string;
    siteId?: string;
  }): Promise<ScheduleResponseDto[]> {
    // Core feature: always enabled

    const where: any = { ...this.prisma.buildSiteFilter() };
    if (filters.taskId) where.taskId = filters.taskId;
    if (filters.status) where.status = filters.status;
    if (filters.siteId) where.siteId = parseInt(filters.siteId, 10);

    const schedules = await this.prisma.client.schedule.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return schedules.map(toScheduleResponse);
  }

  async findOne(id: number): Promise<ScheduleResponseDto> {
    // Core feature: always enabled

    const schedule = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!schedule) throw new NotFoundException(`Schedule ${id} not found`);

    return toScheduleResponse(schedule);
  }

  async update(
    id: number,
    dto: UpdateScheduleDto,
  ): Promise<ScheduleResponseDto> {
    // Core feature: always enabled

    const existing = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    if (existing.status === 'CANCELLED') {
      throw new BadRequestException('Cannot update a cancelled schedule');
    }

    const schedule = await this.prisma.client.schedule.update({
      where: { id },
      data: {
        recurrenceMode: dto.recurrenceMode,
        rrule: dto.rrule,
        timezone: dto.timezone,
        openOffset: dto.openOffset,
        closeOffset: dto.closeOffset,
        dueOffset: dto.dueOffset,
        maxOccurrences: dto.maxOccurrences,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        siteId: dto.siteId,
        label: dto.label,
      },
    });

    this.logger.log(`Updated schedule ${id}`);
    return toScheduleResponse(schedule);
  }

  async remove(id: number): Promise<void> {
    // Core feature: always enabled

    const existing = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    await this.prisma.client.schedule.delete({ where: { id } });
    this.logger.log(`Deleted schedule ${id}`);
  }

  async pause(id: number): Promise<ScheduleResponseDto> {
    // Core feature: always enabled

    const existing = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    if (existing.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Cannot pause a schedule with status ${existing.status}`,
      );
    }

    const schedule = await this.prisma.client.schedule.update({
      where: { id },
      data: { status: 'PAUSED', pausedAt: new Date() },
    });

    this.logger.log(`Paused schedule ${id}`);
    return toScheduleResponse(schedule);
  }

  async resume(id: number): Promise<ScheduleResponseDto> {
    // Core feature: always enabled

    const existing = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    if (existing.status !== 'PAUSED') {
      throw new BadRequestException(
        `Cannot resume a schedule with status ${existing.status}`,
      );
    }

    const schedule = await this.prisma.client.schedule.update({
      where: { id },
      data: { status: 'ACTIVE', pausedAt: null },
    });

    this.logger.log(`Resumed schedule ${id}`);
    return toScheduleResponse(schedule);
  }

  async incrementOccurrence(id: number): Promise<ScheduleResponseDto> {
    const existing = await this.prisma.client.schedule.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException(`Schedule ${id} not found`);

    const newCount = existing.occurrenceCount + 1;
    const autoComplete =
      existing.maxOccurrences && newCount >= existing.maxOccurrences;

    const schedule = await this.prisma.client.schedule.update({
      where: { id },
      data: {
        occurrenceCount: newCount,
        ...(autoComplete ? { status: 'COMPLETED' } : {}),
      },
    });

    if (autoComplete) {
      this.logger.log(
        `Schedule ${id} auto-completed after ${newCount} occurrences`,
      );
    }

    return toScheduleResponse(schedule);
  }
}
