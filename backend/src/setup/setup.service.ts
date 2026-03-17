import { Injectable, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';

/**
 * Setup Service.
 *
 * Handles first-time application setup.
 *
 * Security:
 * - Atomic transaction prevents race conditions (double setup)
 * - Structured logging for all setup attempts
 * - ConflictException if setup already completed
 */
@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if initial setup is needed.
   * Returns true if no admin user exists.
   */
  async needsSetup(): Promise<boolean> {
    const adminCount = await this.prisma.client.user.count({
      where: {
        role: 'SUPER_ADMIN',
        deletedAt: null,
      },
    });
    return adminCount === 0;
  }

  /**
   * Initialize the first admin user, a default site, and optional initial preferences.
   *
   * Security: Uses a single atomic transaction to both verify no admin exists
   * AND create one. This prevents TOCTOU race conditions where two concurrent
   * requests could both pass the needsSetup() check.
   */
  async initializeAdmin(
    username: string,
    password: string,
    preferences?: { addonsTodolistEnabled?: boolean; ip?: string },
  ): Promise<{ success: boolean; message: string }> {
    const ip = preferences?.ip || 'unknown';

    this.logger.log(
      `[SECURITY] Setup initialization attempt — IP: ${ip}`,
    );

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      // Atomic transaction: check + create in one operation
      // This prevents TOCTOU race conditions
      await this.prisma.client.$transaction(async (tx) => {
        // Verify inside transaction — this is the authoritative check
        const existingAdmin = await tx.user.count({
          where: {
            role: 'SUPER_ADMIN',
            deletedAt: null,
          },
        });

        if (existingAdmin > 0) {
          this.logger.warn(
            `[SECURITY] Setup attempt REJECTED (already initialized) — IP: ${ip}`,
          );
          throw new ConflictException('Setup already completed. Instance is already initialized.');
        }

        // Create admin user
        const admin = await tx.user.create({
          data: {
            username,
            fullname: 'Admin Local',
            passwordHash,
            role: 'SUPER_ADMIN',
            authProvider: 'LOCAL',
          },
          select: { id: true },
        });

        // Create default site so groups, guests and user assignments work without extra config
        const defaultSite = await tx.site.create({
          data: {
            name: 'Default',
            code: 'default',
            description: 'Site créé automatiquement lors du premier paramétrage.',
          },
          select: { id: true },
        });

        // Assign admin to default site (required for getDefaultSiteId / buildSiteFilter)
        await tx.userSiteAssignment.create({
          data: {
            userId: admin.id,
            siteId: defaultSite.id,
            isDefault: true,
          },
        });

        this.logger.log(
          `[SECURITY] Setup completed successfully — Admin: ${username}, IP: ${ip}`,
        );
      });
    } catch (error) {
      // Re-throw ConflictException as-is
      if (error instanceof ConflictException) throw error;
      this.logger.error(
        `[SECURITY] Setup failed — IP: ${ip}, Error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    // Persist initial preferences (e.g. Todo list) so first login reflects wizard choices
    const todolistEnabled =
      preferences?.addonsTodolistEnabled !== false ? 'true' : 'false';
    await this.prisma.client.config.upsert({
      where: { key: 'addons.todolist.enabled' },
      create: { key: 'addons.todolist.enabled', value: todolistEnabled },
      update: { value: todolistEnabled },
    });

    return { success: true, message: 'Admin user created successfully' };
  }
}

