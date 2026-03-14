import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RequirePermission } from '../auth/decorators/require-permission.decorator';
import { Permission } from '../auth/permissions.enum';
import { Audit } from '../audit/decorators/audit.decorator';
import { AuditAction, AuditCategory } from '../audit/audit.constants';

/**
 * Users Controller.
 *
 * All endpoints require authentication.
 * Most endpoints require ADMIN role.
 *
 * Endpoints:
 * - GET    /users           - List all users (ADMIN)
 * - GET    /users/count     - Get user counts (ADMIN)
 * - GET    /users/:id       - Get single user (ADMIN)
 * - POST   /users           - Create user (ADMIN)
 * - PUT    /users/:id       - Update user (ADMIN)
 * - DELETE /users/:id       - Soft delete user (ADMIN)
 * - PATCH  /users/:id/restore - Restore deleted user (ADMIN)
 * - POST   /users/:id/reset-password - Reset password (ADMIN)
 */
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'MANAGER') // Legacy fallback
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get all active users.
   */
  @Get()
  @Roles('SUPER_ADMIN', 'MANAGER', 'GUEST')
  @RequirePermission(Permission.USER_READ)
  async findAll() {
    return this.usersService.findAll();
  }

  /**
   * Get user counts.
   */
  @Get('count')
  @Roles('SUPER_ADMIN', 'MANAGER', 'GUEST')
  @RequirePermission(Permission.USER_READ)
  async count() {
    return this.usersService.count();
  }

  /**
   * Get a single user by ID.
   */
  @Get(':id')
  @Roles('SUPER_ADMIN', 'MANAGER', 'GUEST')
  @RequirePermission(Permission.USER_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOne(id);
  }

  /**
   * Create a new user.
   */
  @Post()
  @Audit({
    action: AuditAction.USER_CREATED,
    category: AuditCategory.USER,
  })
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  /**
   * Update an existing user.
   */
  @Put(':id')
  @RequirePermission(Permission.USER_WRITE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.usersService.update(id, dto, {
      id: user.sub,
      username: user.username,
    });
  }

  /**
   * Soft delete a user.
   */
  @Delete(':id')
  @Audit({
    action: AuditAction.USER_DELETED,
    category: AuditCategory.USER,
  })
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.usersService.remove(id);
  }

  /**
   * Restore a soft-deleted user.
   */
  @Patch(':id/restore')
  @Audit({
    action: AuditAction.USER_RESTORED,
    category: AuditCategory.USER,
  })
  @RequirePermission(Permission.USER_WRITE)
  async restore(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.restore(id);
  }

  /**
   * Reset a user's password.
   */
  @Post(':id/reset-password')
  @Audit({
    action: AuditAction.USER_PASSWORD_CHANGED,
    category: AuditCategory.USER,
  })
  @RequirePermission(Permission.USER_WRITE)
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    await this.usersService.resetPassword(id, dto.password);
    return { ok: true };
  }
}
