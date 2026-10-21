import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Permission } from '../auth/permissions.enum';
import { ROLE_PERMISSIONS } from '../auth/role-permissions.config';
import { PrismaService } from '../prisma/prisma.service';
import { StatusService } from '../status/status.service';
import { TasksService } from '../tasks/tasks.service';
import { IncomingWebhookDto } from './dto/incoming-webhook.dto';

/** Roles that may call the webhook with a regular sign-in, like the tasks API they mirror. */
const WEBHOOK_ROLES = ['SUPER_ADMIN', 'MANAGER'];

/**
 * Mapping of webhook actions to required Permission scopes.
 *
 * Each action can only be executed if the caller holds the mapped
 * permission: granted by the role for a signed-in person, granted
 * explicitly on the key for an API key.
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
   * Validate that the caller may perform the given action.
   * API keys must hold the exact scope. People signed in with a JWT are held to
   * the same rule the tasks API applies: only a super admin or a manager, and
   * only with the permission their role grants for that action (a manager
   * cannot delete, a plain user cannot use the webhook at all).
   */
  private validateActionScope(action: string, user: any): void {
    const requiredScope = ACTION_SCOPE_MAP[action];
    if (!requiredScope) {
      return; // Unknown action will be caught by the switch/default
    }

    if (user?.role !== 'API_KEY') {
      const granted = ROLE_PERMISSIONS[user?.role] ?? [];
      if (
        !WEBHOOK_ROLES.includes(user?.role) ||
        !granted.includes(requiredScope)
      ) {
        this.logger.warn(
          `[SECURITY] Webhook role denied — user: ${user?.sub ?? 'unknown'}, ` +
            `role: ${user?.role ?? 'none'}, action: ${action}`,
        );
        throw new ForbiddenException(
          `Your role is not allowed to perform '${action}' through the webhook.`,
        );
      }
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

  /**
   * Verify that a task belongs to the caller's tenant before operating on it.
   * Uses PrismaService.buildSiteFilter() which resolves the caller's accessible sites
   * from the CLS context (set by CompositeAuthGuard).
   *
   * This prevents cross-tenant access: an API key for site A cannot modify
   * tasks belonging to site B, even if the API key has the correct scopes.
   */
  private async assertTaskBelongsToTenant(taskId: number): Promise<void> {
    const siteFilter = this.prisma.buildSiteFilter();

    const task = await this.prisma.client.task.findFirst({
      where: {
        id: taskId,
        deletedAt: null,
        ...siteFilter,
      },
      select: { id: true },
    });

    if (!task) {
      this.logger.warn(
        `[SECURITY] Tenant isolation — task ${taskId} not found or not accessible for current tenant`,
      );
      throw new NotFoundException(
        `Task ${taskId} not found or not accessible from your tenant.`,
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

    // Tenant isolation: verify the task belongs to the caller's tenant
    await this.assertTaskBelongsToTenant(taskId);

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

  private async createTaskAction(dto: IncomingWebhookDto, _user: any) {
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

    // Tenant isolation: verify the task belongs to the caller's tenant
    await this.assertTaskBelongsToTenant(taskId);

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
