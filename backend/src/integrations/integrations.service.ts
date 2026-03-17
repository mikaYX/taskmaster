import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';
import { StatusService } from '../status/status.service';
import { Permission } from '../auth/permissions.enum';

/**
 * Mapping of webhook actions to required Permission scopes.
 *
 * Each action can only be executed if the caller's permissions
 * include the mapped scope. For JWT users, role-based access
 * is assumed (scopes are resolved from the role). For API key users,
 * the scopes must be explicitly granted on the key.
 */
const ACTION_SCOPE_MAP: Record<string, Permission> = {
  CREATE_TASK: Permission.TASK_CREATE,
  COMPLETE_TASK: Permission.TASK_UPDATE,
  DELETE_TASK: Permission.TASK_DELETE,
};

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

    // Validate that the action requires a scope and the user has it
    this.validateActionScope(dto.action, user);

    switch (dto.action) {
      case 'COMPLETE_TASK':
        return this.completeTaskAction(dto, user);
      case 'CREATE_TASK':
        return this.createTaskAction(dto, user);
      case 'DELETE_TASK':
        return this.deleteTaskAction(dto, user);
      default:
        throw new BadRequestException(`Unsupported action: ${dto.action}`);
    }
  }

  /**
   * Validate that the user has the required scope for the given action.
   * JWT users pass through (their permissions are resolved from their role).
   * API key users must have the exact scope.
   */
  private validateActionScope(action: string, user: any): void {
    const requiredScope = ACTION_SCOPE_MAP[action];
    if (!requiredScope) {
      return; // Unknown action will be caught by the switch/default
    }

    // Only enforce scope check for API key users
    if (user?.role !== 'API_KEY') {
      return;
    }

    const userScopes: string[] = user.permissions || [];
    if (!userScopes.includes(requiredScope)) {
      this.logger.warn(
        `[SECURITY] Webhook scope denied — apiKeyId: ${user.id}, ` +
        `action: ${action}, required: ${requiredScope}, ` +
        `granted: [${userScopes.join(', ')}]`,
      );
      throw new ForbiddenException(
        `API key does not have required scope '${requiredScope}' for action '${action}'.`,
      );
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

  private async deleteTaskAction(dto: IncomingWebhookDto, user: any) {
    if (!dto.payload?.taskId) {
      throw new BadRequestException('taskId is required to DELETE_TASK');
    }

    const { taskId } = dto.payload;

    try {
      await this.tasksService.softDelete(taskId, user?.sub || 0);
      this.logger.log(
        `Task ${taskId} deleted via webhook from ${dto.source} by ${user?.id || 'unknown'}`,
      );
      return { success: true, taskId };
    } catch (err: any) {
      this.logger.error(`Failed to delete task via webhook: ${err.message}`);
      throw new BadRequestException(`Failed to delete task: ${err.message}`);
    }
  }
}

