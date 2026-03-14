import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateDelegationDto } from './dto/create-delegation.dto';
import { UpdateDelegationDto } from './dto/update-delegation.dto';
import { Prisma } from '@prisma/client';
import { AuditAction, AuditCategory } from '../../audit/audit.constants';
import { EmailService } from '../../email/email.service';
import { BeneficiaryResolverService } from './beneficiary-resolver.service';

@Injectable()
export class DelegationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly emailService: EmailService,
    private readonly beneficiaryResolver: BeneficiaryResolverService,
  ) {}

  async create(taskId: number, dto: CreateDelegationDto, adminId: number) {
    if (new Date(dto.startAt) >= new Date(dto.endAt)) {
      throw new BadRequestException('startAt must be before endAt');
    }

    try {
      const targetUserIds = dto.targetUserIds || [];
      const targetGroupIds = dto.targetGroupIds || [];

      if (targetUserIds.length === 0 && targetGroupIds.length === 0) {
        throw new BadRequestException(
          'At least one target user or group must be provided',
        );
      }

      const delegation = await this.prisma.client.taskDelegation.create({
        data: {
          taskId,
          delegatedById: adminId,
          startAt: new Date(dto.startAt),
          endAt: new Date(dto.endAt),
          reason: dto.reason,
          targetUsers: {
            create: targetUserIds.map((userId) => ({ userId })),
          },
          targetGroups: {
            create: targetGroupIds.map((groupId) => ({ groupId })),
          },
        },
        include: {
          targetUsers: true,
          targetGroups: true,
        },
      });

      // Log action
      await this.auditService.log({
        action: AuditAction.DELEGATION_CREATED,
        actorId: adminId,
        target: `TaskDelegation:${delegation.id}`,
        category: AuditCategory.TASK,
        details: { taskId, ...dto },
      });

      // Send notifications
      await this.notifyDelegationCreated(delegation);

      return delegation;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2010' // Raw query mapping exception OR Constraint error
      ) {
        if (error.message.includes('no_overlapping_delegations')) {
          throw new ConflictException(
            'Une délégation existe déjà sur cette période pour cette tâche.',
          );
        }
      }
      // P2002 or QueryFailedError may be caught instead depending on prisma Driver
      if (error?.message?.includes('no_overlapping_delegations')) {
        throw new ConflictException(
          'Une délégation existe déjà sur cette période pour cette tâche.',
        );
      }
      throw error;
    }
  }

  private async notifyDelegationCreated(delegation: any) {
    try {
      const beneficiaryIds =
        await this.beneficiaryResolver.resolveBeneficiaryUserIdsFromDelegation(
          delegation,
        );
      const allIds = Array.from(
        new Set([...beneficiaryIds, delegation.delegatedById].filter(Boolean)),
      );

      if (allIds.length === 0) return;

      const usersToNotify = await this.prisma.client.user.findMany({
        where: { id: { in: allIds }, email: { not: null } },
        select: { email: true },
      });

      const emails = Array.from(
        new Set(usersToNotify.map((u) => u.email).filter(Boolean)),
      ) as string[];
      if (emails.length > 0) {
        const startDateStr = new Date(delegation.startAt).toLocaleDateString();
        const endDateStr = new Date(delegation.endAt).toLocaleDateString();
        await this.emailService.send({
          to: emails,
          subject: `Nouvelle délégation pour la Tâche #${delegation.taskId}`,
          text: `Bonjour,\n\nUne nouvelle délégation vous a été attribuée pour la Tâche #${delegation.taskId}.\nElle est valable du ${startDateStr} au ${endDateStr}.\n${delegation.reason ? `Motif: ${delegation.reason}` : ''}\n\nCordialement,\nTaskmaster.`,
        });
      }
    } catch (error) {
      console.error('Failed to send delegation notifications:', error);
    }
  }

  async findAll(taskId: number) {
    return this.prisma.client.taskDelegation.findMany({
      where: { taskId },
      orderBy: { startAt: 'desc' },
      include: {
        delegatedBy: {
          select: { id: true, username: true, fullname: true, email: true },
        },
        targetUsers: {
          include: {
            user: {
              select: { id: true, username: true, fullname: true, email: true },
            },
          },
        },
        targetGroups: {
          include: {
            group: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });
  }

  async update(
    taskId: number,
    id: number,
    dto: UpdateDelegationDto,
    adminId: number,
  ) {
    const existing = await this.prisma.client.taskDelegation.findUnique({
      where: { id },
      include: { targetUsers: true, targetGroups: true },
    });

    if (!existing || existing.taskId !== taskId) {
      throw new NotFoundException(
        `TaskDelegation ${id} not found for task ${taskId}`,
      );
    }

    if (dto.startAt && dto.endAt) {
      if (new Date(dto.startAt) >= new Date(dto.endAt)) {
        throw new BadRequestException('startAt must be before endAt');
      }
    } else if (dto.startAt) {
      if (new Date(dto.startAt) >= existing.endAt!) {
        throw new BadRequestException('startAt must be before existing endAt');
      }
    } else if (dto.endAt) {
      if (existing.startAt! >= new Date(dto.endAt)) {
        throw new BadRequestException('existing startAt must be before endAt');
      }
    }

    // Validate targets
    const finalUserCounts =
      dto.targetUserIds !== undefined
        ? dto.targetUserIds.length
        : existing.targetUsers.length;
    const finalGroupCounts =
      dto.targetGroupIds !== undefined
        ? dto.targetGroupIds.length
        : existing.targetGroups.length;

    if (finalUserCounts === 0 && finalGroupCounts === 0) {
      throw new BadRequestException(
        'Au moins une cible (utilisateur ou groupe) doit être définie pour la délégation.',
      );
    }

    // Calculate new targets if provided, otherwise keep existing logic for update.
    // If targets are updated, we need to completely replace them.
    const updateData: Prisma.TaskDelegationUpdateInput = {};
    if (dto.startAt) updateData.startAt = new Date(dto.startAt);
    if (dto.endAt) updateData.endAt = new Date(dto.endAt);
    if (dto.reason !== undefined) updateData.reason = dto.reason;

    try {
      const txResult = await this.prisma.client.$transaction(async (tx) => {
        const updatedDel = await tx.taskDelegation.update({
          where: { id },
          data: {
            startAt: dto.startAt ? new Date(dto.startAt) : undefined,
            endAt: dto.endAt ? new Date(dto.endAt) : undefined,
            reason: dto.reason,
          },
        });

        if (dto.targetUserIds !== undefined) {
          await tx.taskDelegationTargetUser.deleteMany({
            where: { delegationId: id },
          });
          if (dto.targetUserIds.length > 0) {
            await tx.taskDelegationTargetUser.createMany({
              data: dto.targetUserIds.map((userId) => ({
                delegationId: id,
                userId,
              })),
            });
          }
        }

        if (dto.targetGroupIds !== undefined) {
          await tx.taskDelegationTargetGroup.deleteMany({
            where: { delegationId: id },
          });
          if (dto.targetGroupIds.length > 0) {
            await tx.taskDelegationTargetGroup.createMany({
              data: dto.targetGroupIds.map((groupId) => ({
                delegationId: id,
                groupId,
              })),
            });
          }
        }

        return tx.taskDelegation.findUnique({
          where: { id },
          include: {
            targetUsers: {
              include: { user: { select: { id: true, username: true } } },
            },
            targetGroups: {
              include: { group: { select: { id: true, name: true } } },
            },
          },
        });
      });

      await this.auditService.log({
        action: AuditAction.DELEGATION_UPDATED,
        actorId: adminId,
        target: `Task:${taskId}`,
        category: AuditCategory.TASK,
        details: {
          delegationId: id,
          changes: dto,
        },
      });
      return txResult;
    } catch (error) {
      if (error?.message?.includes('no_overlapping_delegations')) {
        throw new ConflictException(
          'Une délégation existe déjà sur cette période pour cette tâche.',
        );
      }
      throw error;
    }
  }

  async remove(
    taskId: number,
    id: number,
    adminId: number,
    adminUsername: string,
  ) {
    const existing = await this.prisma.client.taskDelegation.findUnique({
      where: { id },
    });

    if (!existing || existing.taskId !== taskId) {
      throw new NotFoundException(
        `TaskDelegation ${id} not found for task ${taskId}`,
      );
    }

    const deleted = await this.prisma.client.taskDelegation.delete({
      where: { id },
    });

    await this.auditService.log({
      action: AuditAction.DELEGATION_REVOKED,
      actorId: adminId,
      target: `Task:${taskId}`,
      category: AuditCategory.TASK,
      details: {
        delegationId: id,
        reason: `Delegation for task ${taskId} removed.`,
      },
    });

    return deleted;
  }
}
