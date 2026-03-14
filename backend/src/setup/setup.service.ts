import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';

/**
 * Setup Service.
 *
 * Handles first-time application setup.
 */
@Injectable()
export class SetupService {
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
   * Only works if no admin exists. Creates a "Default" site so groups/guests work immediately.
   */
  async initializeAdmin(
    username: string,
    password: string,
    preferences?: { addonsTodolistEnabled?: boolean },
  ): Promise<{ success: boolean; message: string }> {
    // Security: Only allow if no admin exists
    const needsSetup = await this.needsSetup();
    if (!needsSetup) {
      return { success: false, message: 'Setup already completed' };
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await this.prisma.client.$transaction(async (tx) => {
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
    });

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
