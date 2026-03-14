import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma';
import { UpsertStatusDto, StatusResponseDto, toStatusResponse } from './dto';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Status Service.
 *
 * Manages task status for specific dates.
 * Uniqueness: (taskId, instanceDate)
 * Idempotent upsert logic.
 * Audit trail via updatedByUserId/Username.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger(StatusService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Upsert status - creates if not exists, updates if exists.
   * Idempotent operation.
   */
  async upsert(
    dto: UpsertStatusDto,
    userId: number,
    username: string,
  ): Promise<StatusResponseDto> {
    // Verify task exists
    const task = await this.prisma.client.task.findUnique({
      where: { id: dto.taskId },
      select: { id: true },
    });
    if (!task) throw new NotFoundException(`Task ${dto.taskId} not found`);

    const instanceDate = new Date(dto.instanceDate);

    const status = await this.prisma.client.status.upsert({
      where: {
        taskId_instanceDate: { taskId: dto.taskId, instanceDate },
      },
      create: {
        taskId: dto.taskId,
        instanceDate,
        status: dto.status,
        comment: dto.comment,
        updatedByUserId: userId,
        updatedByUsername: username,
      },
      update: {
        status: dto.status,
        comment: dto.comment,
        updatedByUserId: userId,
        updatedByUsername: username,
      },
      include: { task: { select: { description: true } } },
    });

    if (dto.status === 'FAILED') {
      this.notificationsService
        .dispatchTaskNotifications(dto.taskId, 'FAILED')
        .catch((err) => {
          this.logger.error(
            `Failed to dispatch FAILED notifications for task ${dto.taskId}`,
            err,
          );
        });
    }

    this.logger.log(
      `Upserted status for task ${dto.taskId} on ${dto.instanceDate}: ${dto.status}`,
    );
    return toStatusResponse(status);
  }

  /**
   * Get status for a specific task and date.
   */
  async findOne(
    taskId: number,
    instanceDate: string,
  ): Promise<StatusResponseDto> {
    const status = await this.prisma.client.status.findUnique({
      where: {
        taskId_instanceDate: { taskId, instanceDate: new Date(instanceDate) },
      },
      include: { task: { select: { description: true } } },
    });

    if (!status) {
      throw new NotFoundException(
        `Status for task ${taskId} on ${instanceDate} not found`,
      );
    }

    return toStatusResponse(status);
  }

  /**
   * Get all statuses for a task.
   */
  async findByTask(taskId: number): Promise<StatusResponseDto[]> {
    const statuses = await this.prisma.client.status.findMany({
      where: { taskId },
      include: { task: { select: { description: true } } },
      orderBy: { instanceDate: 'desc' },
    });
    return statuses.map(toStatusResponse);
  }

  /**
   * Get all statuses for a date range.
   */
  async findByDateRange(
    startDate: string,
    endDate: string,
    statusFilter?: TaskStatus,
  ): Promise<StatusResponseDto[]> {
    const siteFilter = this.prisma.buildSiteFilter();
    const statuses = await this.prisma.client.status.findMany({
      where: {
        instanceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(statusFilter && { status: statusFilter }),
        ...(siteFilter.siteId ? { task: { siteId: siteFilter.siteId } } : {}),
      },
      include: { task: { select: { description: true } } },
      orderBy: [{ instanceDate: 'desc' }, { taskId: 'asc' }],
    });
    return statuses.map(toStatusResponse);
  }

  /**
   * Delete a status entry.
   */
  async remove(taskId: number, instanceDate: string): Promise<void> {
    const status = await this.prisma.client.status.findUnique({
      where: {
        taskId_instanceDate: { taskId, instanceDate: new Date(instanceDate) },
      },
    });

    if (!status) {
      throw new NotFoundException(
        `Status for task ${taskId} on ${instanceDate} not found`,
      );
    }

    await this.prisma.client.status.delete({
      where: { id: status.id },
    });

    this.logger.log(`Deleted status for task ${taskId} on ${instanceDate}`);
  }

  /**
   * Get status counts for a date range.
   */
  async countByDateRange(
    startDate: string,
    endDate: string,
  ): Promise<Record<TaskStatus, number>> {
    const siteFilter = this.prisma.buildSiteFilter();
    const counts = await this.prisma.client.status.groupBy({
      by: ['status'],
      where: {
        instanceDate: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        ...(siteFilter.siteId ? { task: { siteId: siteFilter.siteId } } : {}),
      },
      _count: true,
    });

    return {
      SUCCESS: counts.find((c) => c.status === 'SUCCESS')?._count ?? 0,
      RUNNING: counts.find((c) => c.status === 'RUNNING')?._count ?? 0,
      FAILED: counts.find((c) => c.status === 'FAILED')?._count ?? 0,
      MISSING: counts.find((c) => c.status === 'MISSING')?._count ?? 0,
    };
  }
}
