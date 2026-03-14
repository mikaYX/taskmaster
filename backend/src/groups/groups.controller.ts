import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { CreateGroupDto, UpdateGroupDto, ManageMembersDto } from './dto';
import { JwtAuthGuard, RolesGuard, Roles } from '../auth';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';

/**
 * Groups Controller.
 *
 * All endpoints require ADMIN role.
 *
 * Endpoints:
 * - GET    /groups              - List all groups
 * - GET    /groups/count        - Get group counts
 * - GET    /groups/:id          - Get single group with members
 * - POST   /groups              - Create group
 * - PUT    /groups/:id          - Update group
 * - DELETE /groups/:id          - Delete group (non-system only)
 * - GET    /groups/:id/members  - Get group members
 * - POST   /groups/:id/members  - Add members to group
 * - DELETE /groups/:id/members  - Remove members from group
 */
@Controller('groups')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Get all groups with member counts.
   */
  @Get()
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async findAll() {
    return this.groupsService.findAll();
  }

  /**
   * Get group counts.
   */
  @Get('count')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async count() {
    return this.groupsService.count();
  }

  /**
   * Get a single group with members.
   */
  @Get(':id')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.findOne(id);
  }

  /**
   * Create a new group.
   */
  @Post()
  @Audit({
    action: AuditAction.GROUP_CREATED,
    category: AuditCategory.GROUP,
  })
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateGroupDto) {
    return this.groupsService.create(dto);
  }

  /**
   * Update an existing group.
   */
  @Put(':id')
  @Audit({
    action: AuditAction.GROUP_UPDATED,
    category: AuditCategory.GROUP,
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupsService.update(id, dto);
  }

  /**
   * Delete a group.
   */
  @Delete(':id')
  @Audit({
    action: AuditAction.GROUP_DELETED,
    category: AuditCategory.GROUP,
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.groupsService.remove(id);
  }

  /**
   * Get group members.
   */
  @Get(':id/members')
  @Roles('SUPER_ADMIN', 'MANAGER', 'USER', 'GUEST')
  async getMembers(@Param('id', ParseIntPipe) id: number) {
    return this.groupsService.getMembers(id);
  }

  /**
   * Add members to a group.
   */
  @Post(':id/members')
  @Audit({
    action: AuditAction.GROUP_MEMBER_ADDED,
    category: AuditCategory.GROUP,
  })
  async addMembers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageMembersDto,
  ) {
    return this.groupsService.addMembers(id, dto.userIds);
  }

  /**
   * Remove members from a group.
   */
  @Delete(':id/members')
  @Audit({
    action: AuditAction.GROUP_MEMBER_REMOVED,
    category: AuditCategory.GROUP,
  })
  async removeMembers(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManageMembersDto,
  ) {
    return this.groupsService.removeMembers(id, dto.userIds);
  }
}
