import { SettingsService } from '../settings/settings.service';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
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
import {
  AuditAction,
  AuditCategory,
  AuditSeverity,
} from '../audit/audit.constants';

/** The authenticated user performing an operation. */
export interface UserActor {
  id: number;
  username: string;
  role: string;
}

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
    private readonly settings: SettingsService,
  ) {}

  /** Site ids the given user is assigned to (the scope of a manager). */
  private async getSiteIds(userId: number): Promise<number[]> {
    const rows = await this.prisma.client.userSiteAssignment.findMany({
      where: { userId },
      select: { siteId: true },
    });
    return rows.map((row) => row.siteId);
  }

  /**
   * Authorization for acting on another account.
   * - SUPER_ADMIN: any account.
   * - MANAGER: USER and MANAGER accounts that share at least one site with
   *   the manager; never a SUPER_ADMIN or a guest link.
   * - anyone else: refused.
   * No actor means a trusted internal caller.
   */
  private async assertCanManage(
    actor: UserActor | undefined,
    target: { id: number; role: string },
  ): Promise<void> {
    if (!actor || actor.role === 'SUPER_ADMIN') return;

    if (actor.role !== 'MANAGER') {
      throw new ForbiddenException('Insufficient privileges to manage users.');
    }
    if (target.role !== 'USER' && target.role !== 'MANAGER') {
      this.logger.warn(
        `Privilege escalation attempt: manager ${actor.username} targeted a ${target.role} account (ID: ${target.id})`,
      );
      throw new ForbiddenException(
        'Managers cannot manage administrator or guest accounts.',
      );
    }

    const [mine, theirs] = await Promise.all([
      this.getSiteIds(actor.id),
      this.getSiteIds(target.id),
    ]);
    if (!theirs.some((siteId) => mine.includes(siteId))) {
      throw new ForbiddenException(
        'This account does not belong to one of your sites.',
      );
    }
  }

  /**
   * A deleted account is restored first, never edited or given a password: the
   * person has no access and could be handed credentials by mistake.
   */
  private assertNotDeleted(user: {
    username: string;
    deletedAt?: Date | null;
  }): void {
    if (user.deletedAt) {
      throw new ConflictException(
        `Account "${user.username}" is deleted. Restore it before changing it.`,
      );
    }
  }

  /** Site a new account is attached to; managers are held to their own sites. */
  private async resolveCreationSite(
    requested: number | undefined,
    actor?: UserActor,
  ): Promise<number> {
    if (actor && actor.role !== 'SUPER_ADMIN') {
      if (actor.role !== 'MANAGER') {
        throw new ForbiddenException(
          'Insufficient privileges to create users.',
        );
      }
      const mine = await this.getSiteIds(actor.id);
      const siteId = requested ?? this.prisma.getDefaultSiteId() ?? mine[0];
      if (!siteId || !mine.includes(siteId)) {
        throw new ForbiddenException(
          'Managers can only create users on their own sites.',
        );
      }
      return siteId;
    }

    const siteId = requested ?? this.prisma.getDefaultSiteId();
    if (!siteId) {
      throw new BadRequestException(
        'Cannot create user: no siteId provided and no default site found for the current user.',
      );
    }
    return siteId;
  }

  private readonly profileSelect = {
    id: true,
    username: true,
    fullname: true,
    email: true,
    role: true,
    avatarUrl: true,
    mfaEnabled: true,
  } as const;

  async getOwnProfile(userId: number) {
    const user = await this.prisma.client.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: this.profileSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      ...user,
      mfaRequired:
        String(await this.settings.getRawValue('auth.mfa.required')) === 'true',
    };
  }

  async updateOwnProfile(userId: number, fullname: string) {
    const user = await this.prisma.client.user.update({
      where: { id: userId, deletedAt: null },
      data: { fullname: fullname.trim() || null },
      select: this.profileSelect,
    });
    return {
      ...user,
      mfaRequired:
        String(await this.settings.getRawValue('auth.mfa.required')) === 'true',
    };
  }

  /**
   * Get users (active ones by default).
   * - includeDeleted: also return soft-deleted accounts.
   * - manageableBy: restrict to the accounts that actor may manage (for a
   *   manager: USER/MANAGER accounts on their sites).
   */
  async findAll(
    options: { includeDeleted?: boolean; manageableBy?: UserActor } = {},
  ): Promise<UserResponseDto[]> {
    const { includeDeleted = false, manageableBy } = options;
    const where: Record<string, unknown> = includeDeleted
      ? {}
      : { deletedAt: null };

    if (manageableBy && manageableBy.role !== 'SUPER_ADMIN') {
      if (manageableBy.role !== 'MANAGER') return [];
      const mine = await this.getSiteIds(manageableBy.id);
      where.role = { in: ['USER', 'MANAGER'] };
      where.sites = { some: { siteId: { in: mine } } };
    }

    const users = await this.prisma.client.user.findMany({
      where,
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
  async create(
    dto: CreateUserDto,
    actor?: UserActor,
  ): Promise<UserResponseDto> {
    // Check username uniqueness
    const existing = await this.prisma.client.user.findUnique({
      where: { username: dto.username },
    });

    if (existing) {
      // Soft-deleted accounts keep their username, so they block re-creation.
      throw new ConflictException(
        existing.deletedAt
          ? `Username "${dto.username}" belongs to a deleted account. Restore it from the deleted users list instead of creating a new one.`
          : `Username "${dto.username}" already exists`,
      );
    }

    // BLOCK GUEST ROLE via standard endpoint
    if (dto.role === 'GUEST') {
      throw new ConflictException(
        'Guest users cannot be created via the standard user endpoint. Use the dedicated Guest TV Link flow.',
      );
    }

    if (dto.role === 'SUPER_ADMIN' && actor && actor.role !== 'SUPER_ADMIN') {
      this.logger.warn(
        `Privilege escalation attempt: User ${actor.username} tried to create a SUPER_ADMIN`,
      );
      throw new ForbiddenException(
        'Only administrators can create SUPER_ADMIN users.',
      );
    }

    const siteId = await this.resolveCreationSite(dto.siteId, actor);
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
    actor?: UserActor,
  ): Promise<UserResponseDto> {
    const existing = await this.prisma.client.user.findFirst({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    if (existing.role === 'GUEST' || dto.role === 'GUEST') {
      throw new ConflictException(
        'Guest users cannot be managed via the standard user endpoint. Use the dedicated Guest TV Link flow.',
      );
    }

    if (
      dto.role &&
      dto.role !== existing.role &&
      (dto.role === 'SUPER_ADMIN' || existing.role === 'SUPER_ADMIN') &&
      actor &&
      actor.role !== 'SUPER_ADMIN'
    ) {
      this.logger.warn(
        `Privilege escalation attempt: User ${actor.username} tried to change role from ${existing.role} to ${dto.role}`,
      );
      throw new ForbiddenException(
        'Only administrators can grant or revoke the SUPER_ADMIN role.',
      );
    }

    await this.assertCanManage(actor, existing);
    this.assertNotDeleted(existing);

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

      if (dto.role && dto.role !== existing.role) {
        await this.auditService.log({
          action: AuditAction.USER_ROLE_CHANGED,
          actorId: actor.id,
          actorName: actor.username,
          target: `User:${id}`,
          category: AuditCategory.USER,
          severity: AuditSeverity.WARN,
          details: { from: existing.role, to: dto.role },
        });
      }
    }

    this.logger.log(`Updated user: ${user.username} (ID: ${user.id})`);
    return toUserResponse(user);
  }

  /**
   * Soft delete a user.
   * Sets deletedAt timestamp instead of removing.
   */
  async remove(id: number, actor?: UserActor): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.assertCanManage(actor, user);

    await this.prisma.client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    this.logger.log(`Soft-deleted user: ${user.username} (ID: ${id})`);
  }

  /**
   * Reset a user's password (admin action).
   */
  async resetPassword(
    id: number,
    newPassword: string,
    actor?: UserActor,
  ): Promise<void> {
    const user = await this.prisma.client.user.findFirst({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    await this.assertCanManage(actor, user);
    this.assertNotDeleted(user);

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

    await this.authService.invalidateSession(id);
    this.logger.log(`Password reset for user: ${user.username} (ID: ${id})`);
  }

  /**
   * Restore a soft-deleted user.
   */
  async restore(id: number, actor?: UserActor): Promise<UserResponseDto> {
    const user = await this.prisma.client.user.findFirst({
      where: { id, deletedAt: { not: null } },
    });

    if (!user) {
      throw new NotFoundException(`Deleted user with ID ${id} not found`);
    }

    await this.assertCanManage(actor, user);

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
