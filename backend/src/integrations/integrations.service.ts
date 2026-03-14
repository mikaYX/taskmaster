import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';
import { StatusService } from '../status/status.service';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly statusService: StatusService,
  ) {}

  async processIncomingWebhook(dto: IncomingWebhookDto, user: any) {
    this.logger.log(
      `Processing incoming webhook from ${dto.source} for action ${dto.action}`,
    );

    switch (dto.action) {
      case 'COMPLETE_TASK':
        return this.completeTaskAction(dto, user);
      case 'CREATE_TASK':
        return this.createTaskAction(dto, user);
      default:
        throw new BadRequestException(`Unsupported action: ${dto.action}`);
    }
  }

  private async completeTaskAction(dto: IncomingWebhookDto, user: any) {
    if (!dto.payload?.taskId || !dto.payload?.instanceDate) {
      throw new BadRequestException(
        'taskId and instanceDate are required to COMPLETE_TASK',
      );
    }

    const { taskId, instanceDate, comment } = dto.payload;

    try {
      const result = await this.statusService.upsert(
        {
          taskId,
          instanceDate,
          status: 'SUCCESS',
          comment: comment || `Completed via ${dto.source}`,
        },
        user?.sub || 0,
        user?.username || dto.source,
      );
      return { success: true, result };
    } catch (err: any) {
      this.logger.error(`Failed to complete task via webhook: ${err.message}`);
      throw new BadRequestException(`Failed to complete task: ${err.message}`);
    }
  }

  private async createTaskAction(dto: IncomingWebhookDto, user: any) {
    // Requires payload validation
    const { name, description, periodicity, startDate } = dto.payload;

    if (!name || !periodicity || !startDate) {
      throw new BadRequestException(
        'name, periodicity and startDate are required to CREATE_TASK',
      );
    }

    try {
      const result = await this.tasksService.create({
        name,
        description: description || '',
        periodicity,
        startDate,
        priority: dto.payload.priority || 'MEDIUM',
        project: dto.payload.project || dto.source,
        category: dto.payload.category || 'Webhook',
      });
      return { success: true, taskId: result.id };
    } catch (err: any) {
      this.logger.error(`Failed to create task via webhook: ${err.message}`);
      throw new BadRequestException(`Failed to create task: ${err.message}`);
    }
  }
}
