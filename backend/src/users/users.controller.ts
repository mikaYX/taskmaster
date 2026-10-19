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
import { UserWelcomeEmailService } from './user-welcome-email.service';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser } from '../auth';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
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
  constructor(
    private readonly usersService: UsersService,
    private readonly welcomeEmail: UserWelcomeEmailService,
  ) {}

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
   * Whether credentials can be emailed (email enabled and configured).
   * Open to every role allowed to create users, unlike GET /settings.
   */
  @Get('email-available')
  @RequirePermission(Permission.USER_WRITE)
  async emailAvailable() {
    return { available: await this.welcomeEmail.isAvailable() };
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
  async create(@Body() dto: CreateUserDto, @CurrentUser() user: JwtPayload) {
    const { sendEmail, ...data } = dto;
    const created = await this.usersService.create(data, {
      id: user.sub,
      username: user.username,
      role: user.role,
    });
    if (!sendEmail) return created;

    const credentialsEmail = await this.welcomeEmail.sendCredentials({
      username: created.username,
      fullname: created.fullname,
      email: created.email,
      temporaryPassword: dto.password,
    });
    return { ...created, credentialsEmail };
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
      role: user.role,
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
    if (!dto.sendEmail) return { ok: true };

    const target = await this.usersService.findOne(id);
    const credentialsEmail = await this.welcomeEmail.sendCredentials(
      {
        username: target.username,
        fullname: target.fullname,
        email: target.email,
        temporaryPassword: dto.password,
      },
      'RESET',
    );
    return { ok: true, credentialsEmail };
  }
}
