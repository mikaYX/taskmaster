import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';
import { AssignUserToSiteDto } from './dto/assign-user.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Controller('sites')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async findAll(@CurrentUser() user: JwtPayload) {
    if (user.role === 'SUPER_ADMIN') {
      return this.sitesService.findAll();
    }
    return this.sitesService.getUserSites(user.id!);
  }

  @Get(':id')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const site = await this.sitesService.findOne(id);

    if (user.role !== 'SUPER_ADMIN') {
      const userSiteIds = (user.sites || []).map((s) => s.siteId);
      if (!userSiteIds.includes(id)) {
        throw new ForbiddenException('You do not have access to this site');
      }
    }

    return site;
  }

  @Post()
  @Roles('SUPER_ADMIN')
  async create(@Body() dto: CreateSiteDto) {
    return this.sitesService.create(dto);
  }

  @Put(':id')
  @Roles('SUPER_ADMIN')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSiteDto,
  ) {
    return this.sitesService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  async delete(@Param('id', ParseIntPipe) id: number) {
    return this.sitesService.delete(id);
  }

  // ==================== USER ASSIGNMENTS ====================

  @Get(':siteId/users')
  @Roles('SUPER_ADMIN', 'MANAGER')
  async getSiteUsers(
    @Param('siteId', ParseIntPipe) siteId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === 'MANAGER') {
      const userSiteIds = (user.sites || []).map((s) => s.siteId);
      if (!userSiteIds.includes(siteId)) {
        throw new ForbiddenException('You cannot view users of this site');
      }
    }

    return this.sitesService.getSiteUsers(siteId);
  }

  @Post(':siteId/users/:userId')
  @Roles('SUPER_ADMIN', 'MANAGER')
  async assignUser(
    @Param('siteId', ParseIntPipe) siteId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: AssignUserToSiteDto,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === 'MANAGER') {
      const userSiteIds = (user.sites || []).map((s) => s.siteId);
      if (!userSiteIds.includes(siteId)) {
        throw new ForbiddenException('You cannot assign users to this site');
      }
    }

    return this.sitesService.assignUserToSite(userId, siteId, dto.isDefault);
  }

  @Delete(':siteId/users/:userId')
  @Roles('SUPER_ADMIN', 'MANAGER')
  async removeUser(
    @Param('siteId', ParseIntPipe) siteId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    if (user.role === 'MANAGER') {
      const userSiteIds = (user.sites || []).map((s) => s.siteId);
      if (!userSiteIds.includes(siteId)) {
        throw new ForbiddenException('You cannot remove users from this site');
      }
    }

    return this.sitesService.removeUserFromSite(userId, siteId);
  }
}
