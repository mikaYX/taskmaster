import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Injectable()
export class SitesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.client.site.findMany({
      where: { isActive: true },
      include: {
        parent: { select: { id: true, name: true, code: true } },
        children: { select: { id: true, name: true, code: true } },
        _count: {
          select: {
            users: true,
            tasks: true,
            groups: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: number) {
    const site = await this.prisma.client.site.findUnique({
      where: { id, isActive: true },
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            users: true,
            tasks: true,
            groups: true,
            taskAssignments: true,
          },
        },
      },
    });

    if (!site) {
      throw new NotFoundException(`Site with ID ${id} not found`);
    }

    return site;
  }

  async create(dto: CreateSiteDto) {
    const existing = await this.prisma.client.site.findUnique({
      where: { code: dto.code },
    });

    if (existing) {
      throw new ConflictException(
        `Site with code '${dto.code}' already exists`,
      );
    }

    if (dto.parentId) {
      const parent = await this.prisma.client.site.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent) {
        throw new NotFoundException(
          `Parent site with ID ${dto.parentId} not found`,
        );
      }
    }

    return this.prisma.client.site.create({
      data: {
        name: dto.name,
        code: dto.code,
        description: dto.description,
        parentId: dto.parentId,
      },
      include: {
        parent: true,
        _count: {
          select: { users: true, tasks: true, groups: true },
        },
      },
    });
  }

  async update(id: number, dto: UpdateSiteDto) {
    await this.findOne(id);

    if (dto.code) {
      const existing = await this.prisma.client.site.findUnique({
        where: { code: dto.code },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(
          `Site with code '${dto.code}' already exists`,
        );
      }
    }

    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException('A site cannot be its own parent');
      }
    }

    return this.prisma.client.site.update({
      where: { id },
      data: dto,
      include: {
        parent: true,
        children: true,
        _count: {
          select: { users: true, tasks: true, groups: true },
        },
      },
    });
  }

  async delete(id: number) {
    await this.findOne(id);

    await this.prisma.client.site.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ==================== USER ASSIGNMENTS ====================

  async getUserSites(userId: number) {
    const assignments = await this.prisma.client.userSiteAssignment.findMany({
      where: { userId },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            code: true,
            description: true,
          },
        },
      },
      orderBy: [{ isDefault: 'desc' }, { site: { name: 'asc' } }],
    });

    return assignments.map((a) => ({
      ...a.site,
      isDefault: a.isDefault,
      assignedAt: a.createdAt,
    }));
  }

  async assignUserToSite(userId: number, siteId: number, isDefault = false) {
    await this.findOne(siteId);

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (isDefault) {
      await this.prisma.client.userSiteAssignment.updateMany({
        where: { userId },
        data: { isDefault: false },
      });
    }

    return this.prisma.client.userSiteAssignment.upsert({
      where: {
        userId_siteId: { userId, siteId },
      },
      create: {
        userId,
        siteId,
        isDefault,
      },
      update: {
        isDefault,
      },
    });
  }

  async removeUserFromSite(userId: number, siteId: number) {
    const assignment = await this.prisma.client.userSiteAssignment.findUnique({
      where: { userId_siteId: { userId, siteId } },
    });

    if (!assignment) {
      throw new NotFoundException(
        `User ${userId} is not assigned to site ${siteId}`,
      );
    }

    const user = await this.prisma.client.user.findUnique({
      where: { id: userId },
      include: { sites: true },
    });

    if (user && user.role !== 'SUPER_ADMIN' && user.sites.length <= 1) {
      throw new BadRequestException(
        'Cannot remove the last site assignment from a MANAGER or USER',
      );
    }

    await this.prisma.client.userSiteAssignment.delete({
      where: { userId_siteId: { userId, siteId } },
    });
  }

  async getSiteUsers(siteId: number) {
    await this.findOne(siteId);

    const assignments = await this.prisma.client.userSiteAssignment.findMany({
      where: { siteId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            fullname: true,
            email: true,
            role: true,
          },
        },
      },
    });

    return assignments.map((a) => ({
      ...a.user,
      isDefault: a.isDefault,
      assignedAt: a.createdAt,
    }));
  }
}
