import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import { AuthService } from '../auth';
import {
  CreateUserDto,
  UpdateUserDto,
  UserResponseDto,
  toUserResponse,
} from './dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditCategory } from '../audit/audit.constants';

/**
 * Users Service.
 *
 * Handles:
 * - CRUD operations for users
 * - Soft delete (set deletedAt instead of removing)
 * - Password management (via AuthService)
 *
 * Security:
 * - Never returns passwordHash
 * - Filters out soft-deleted users by default
 * - Groups included as read-only (no management)
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
  ) { }

  /**
   * Get all active users (excludes soft-deleted).
   */
  async findAll(): Promise<UserResponseDto[]> {
    const users = await this.prisma.client.user.findMany({
      where: { deletedAt: null },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
      orderBy: { username: 'asc' },
    });

    return users.map(toUserResponse);
  }

  /**
   * Get a single user by ID.
   */
  async findOne(id: number): Promise<UserResponseDto> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return toUserResponse(user);
  }

  /**
   * Get a user by username.
   */
  async findByUsername(username: string): Promise<UserResponseDto | null> {
    const user = await this.prisma.client.user.findFirst({
      where: { username, deletedAt: null },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
    });

    return user ? toUserResponse(user) : null;
  }

  /**
   * Create a new user.
   */
  async create(dto: CreateUserDto): Promise<UserResponseDto> {
    // Check username uniqueness
    const existing = await this.prisma.client.user.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      throw new ConflictException(`Username "${dto.username}" already exists`);
    }

    // BLOCK GUEST ROLE via standard endpoint
    if (dto.role === 'GUEST') {
      throw new ConflictException(
        'Guest users cannot be created via the standard user endpoint. Use the dedicated Guest TV Link flow.',
      );
    }

    const passwordHash = await this.authService.hashPassword(dto.password);

    const user = await this.prisma.client.user.create({
      data: {
        username: dto.username,
        fullname: dto.fullname,
        email: dto.email,
        passwordHash,
        role: dto.role ?? 'USER',
        authProvider: 'LOCAL',
        mustChangePassword: true,
      },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
    });

    const siteId = dto.siteId ?? this.prisma.getDefaultSiteId();
    if (!siteId) {
      throw new BadRequestException(
        'Cannot create user: no siteId provided and no default site found for the current user.',
      );
    }
    await this.prisma.client.userSiteAssignment.create({
      data: { userId: user.id, siteId, isDefault: true },
    });

    this.logger.log(
      `Created user: ${user.username} (ID: ${user.id}) on site ${siteId}`,
    );
    return toUserResponse(user);
  }

  /**
   * Update an existing user.
   */
  async update(
    id: number,
    dto: UpdateUserDto,
    actor?: { id: number; username: string },
  ): Promise<UserResponseDto> {
    // Verify user exists and is active
    const existing = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (existing.role === 'GUEST' || dto.role === 'GUEST') {
      throw new ConflictException(
        'Guest users cannot be managed via the standard user endpoint. Use the dedicated Guest TV Link flow.',
      );
    }

    const user = await this.prisma.client.user.update({
      where: { id },
      data: {
        fullname: dto.fullname,
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        email: dto.email,
        role: dto.role,
      },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
    });

    if (actor) {
      await this.auditService.logDiff({
        action: AuditAction.USER_UPDATED,
        actor,
        target: `User:${id}`,
        category: AuditCategory.USER,
        before: existing,
        after: user,
      });
    }

    this.logger.log(`Updated user: ${user.username} (ID: ${user.id})`);
    return toUserResponse(user);
  }

  /**
   * Soft delete a user.
   * Sets deletedAt timestamp instead of removing.
   */
  async remove(id: number): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.prisma.client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Soft-deleted user: ${user.username} (ID: ${id})`);
  }

  /**
   * Reset a user's password (admin action).
   */
  async resetPassword(id: number, newPassword: string): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (user.authProvider !== 'LOCAL') {
      throw new ConflictException(
        'Cannot reset password for external auth provider',
      );
    }

    const passwordHash = await this.authService.hashPassword(newPassword);

    await this.prisma.client.user.update({
      where: { id },
      data: {
        passwordHash,
        mustChangePassword: true,
      },
    });

    this.logger.log(`Password reset for user: ${user.username} (ID: ${id})`);
  }

  /**
   * Restore a soft-deleted user.
   */
  async restore(id: number): Promise<UserResponseDto> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!user) {
      throw new NotFoundException(`Deleted user with ID ${id} not found`);
    }

    const restored = await this.prisma.client.user.update({
      where: { id },
      data: { deletedAt: null },
      include: {
        groupMemberships: {
          include: {
            group: { select: { name: true } },
          },
        },
      },
    });

    this.logger.log(`Restored user: ${restored.username} (ID: ${id})`);
    return toUserResponse(restored);
  }

  /**
   * Update a user's avatar URL (used by POST /users/me/avatar).
   */
  async updateAvatar(userId: number, avatarUrl: string): Promise<void> {
    await this.prisma.client.user.update({
      where: { id: userId },
      data: { avatarUrl } as { avatarUrl: string },
    });
  }

  /**
   * Get user count (for admin dashboard).
   */
  async count(): Promise<{ total: number; active: number }> {
    const [total, active] = await Promise.all([
      this.prisma.client.user.count(),
      this.prisma.client.user.count({ where: { deletedAt: null } }),
    ]);
    return { total, active };
  }
}
