import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import {
  CreateGroupDto,
  UpdateGroupDto,
  GroupResponseDto,
  toGroupResponse,
} from './dto';

@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<GroupResponseDto[]> {
    const groups = await this.prisma.client.group.findMany({
      where: { deletedAt: null, ...this.prisma.buildSiteFilter() },
      include: {
        site: { select: { id: true, name: true, code: true } },
        _count: { select: { members: true } },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map(toGroupResponse);
  }

  async findOne(id: number): Promise<GroupResponseDto> {
    const group = await this.prisma.client.group.findFirst({
      where: { id, deletedAt: null },
      include: {
        site: { select: { id: true, name: true, code: true } },
        members: {
          include: {
            user: {
              select: { id: true, username: true, fullname: true },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    return toGroupResponse(group);
  }

  async create(dto: CreateGroupDto): Promise<GroupResponseDto> {
    const user = this.prisma.getCurrentUser();

    let targetSiteId: number;

    if (dto.siteId !== undefined) {
      targetSiteId = dto.siteId;

      if (user && user.role === 'MANAGER') {
        const userSiteIds = this.prisma.getUserSiteIds();
        if (!userSiteIds.includes(targetSiteId)) {
          throw new ForbiddenException(
            `You cannot create groups in site ${targetSiteId}`,
          );
        }
      }

      const siteExists = await this.prisma.client.site.findUnique({
        where: { id: targetSiteId },
      });
      if (!siteExists) {
        throw new NotFoundException(`Site with ID ${targetSiteId} not found`);
      }
    } else {
      let resolvedSiteId: number | undefined;
      const defaultId = this.prisma.getDefaultSiteId();
      if (defaultId != null) {
        const siteExists = await this.prisma.client.site.findUnique({
          where: { id: defaultId },
        });
        if (siteExists) {
          resolvedSiteId = defaultId;
        }
      }
      if (resolvedSiteId === undefined) {
        const firstSite = await this.prisma.client.site.findFirst({
          orderBy: { id: 'asc' },
          select: { id: true },
        });
        if (!firstSite) {
          throw new BadRequestException(
            'No site exists. Create a site first (e.g. via Setup or Settings > Sites).',
          );
        }
        resolvedSiteId = firstSite.id;
      }
      targetSiteId = resolvedSiteId;
    }

    const existing = await this.prisma.client.group.findFirst({
      where: { name: dto.name, deletedAt: null },
    });

    if (existing) {
      throw new ConflictException(`Group "${dto.name}" already exists`);
    }

    const group = await this.prisma.client.group.create({
      data: {
        name: dto.name,
        isSystem: dto.isSystem ?? false,
        description: dto.description,
        siteId: targetSiteId,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        _count: { select: { members: true } },
      },
    });

    this.logger.log(
      `Created group: ${group.name} (ID: ${group.id}) in site ${targetSiteId}`,
    );
    return toGroupResponse(group);
  }

  async update(id: number, dto: UpdateGroupDto): Promise<GroupResponseDto> {
    const existing = await this.prisma.client.group.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    const user = this.prisma.getCurrentUser();

    if (dto.siteId !== undefined && dto.siteId !== existing.siteId) {
      if (user && user.role === 'MANAGER') {
        const userSiteIds = this.prisma.getUserSiteIds();
        if (!userSiteIds.includes(existing.siteId)) {
          throw new ForbiddenException('You do not have access to this group');
        }
        if (!userSiteIds.includes(dto.siteId)) {
          throw new ForbiddenException(
            `You cannot move group to site ${dto.siteId}`,
          );
        }
      }

      const siteExists = await this.prisma.client.site.findUnique({
        where: { id: dto.siteId },
      });
      if (!siteExists) {
        throw new NotFoundException(`Site with ID ${dto.siteId} not found`);
      }

      this.logger.warn(
        `Group ${id} moved from site ${existing.siteId} to site ${dto.siteId} by user ${user?.id}`,
      );
    }

    if (dto.name && dto.name !== existing.name) {
      const nameExists = await this.prisma.client.group.findFirst({
        where: { name: dto.name, deletedAt: null },
      });
      if (nameExists) {
        throw new ConflictException(`Group "${dto.name}" already exists`);
      }
    }

    const group = await this.prisma.client.group.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        siteId: dto.siteId,
      },
      include: {
        site: { select: { id: true, name: true, code: true } },
        _count: { select: { members: true } },
      },
    });

    this.logger.log(`Updated group: ${group.name} (ID: ${id})`);
    return toGroupResponse(group);
  }

  async remove(id: number): Promise<void> {
    const group = await this.prisma.client.group.findFirst({
      where: { id, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${id} not found`);
    }

    if (group.isSystem) {
      throw new ConflictException('Cannot delete a system group');
    }

    // Soft-delete : cohérence avec User et Task (deletedAt au lieu de DELETE physique)
    await this.prisma.client.group.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    this.logger.log(`Soft-deleted group: ${group.name} (ID: ${id})`);
  }

  async addMembers(
    groupId: number,
    userIds: number[],
  ): Promise<GroupResponseDto> {
    const group = await this.prisma.client.group.findFirst({
      where: { id: groupId, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    const users = await this.prisma.client.user.findMany({
      where: { id: { in: userIds }, deletedAt: null },
      select: { id: true },
    });

    if (users.length !== userIds.length) {
      throw new NotFoundException('One or more users not found');
    }

    await this.prisma.client.userGroupMembership.createMany({
      data: userIds.map((userId) => ({ userId, groupId })),
      skipDuplicates: true,
    });

    this.logger.log(`Added ${userIds.length} members to group ${group.name}`);
    return this.findOne(groupId);
  }

  async removeMembers(
    groupId: number,
    userIds: number[],
  ): Promise<GroupResponseDto> {
    const group = await this.prisma.client.group.findFirst({
      where: { id: groupId, deletedAt: null },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    await this.prisma.client.userGroupMembership.deleteMany({
      where: {
        groupId,
        userId: { in: userIds },
      },
    });

    this.logger.log(
      `Removed ${userIds.length} members from group ${group.name}`,
    );
    return this.findOne(groupId);
  }

  async getMembers(
    groupId: number,
  ): Promise<{ id: number; username: string; fullname: string | null }[]> {
    const group = await this.prisma.client.group.findFirst({
      where: { id: groupId, deletedAt: null },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, username: true, fullname: true },
            },
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundException(`Group with ID ${groupId} not found`);
    }

    return group.members.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      fullname: m.user.fullname,
    }));
  }

  async count(): Promise<{ total: number; system: number }> {
    const siteFilter = this.prisma.buildSiteFilter();
    const [total, system] = await Promise.all([
      this.prisma.client.group.count({
        where: { deletedAt: null, ...siteFilter },
      }),
      this.prisma.client.group.count({
        where: { deletedAt: null, isSystem: true, ...siteFilter },
      }),
    ]);
    return { total, system };
  }
}
