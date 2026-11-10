import { Injectable, ConflictException, Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma';
import { BCRYPT_ROUNDS } from '../auth/auth.constants';
import { SettingsService } from '../settings';

/**
 * Setup Service.
 *
 * Handles first-time application setup.
 *
 * Security:
 * - Atomic transaction prevents race conditions (double setup)
 * - Structured logging for all setup attempts
 * - ConflictException if setup already completed
 * - Idempotent flag `setup.completed` persisted so the wizard cannot be
 *   re-triggered after a SUPER_ADMIN soft-delete (AUDIT.md Finding #7 / §6.6)
 */
/** Same shape the setup wizard checks before it sends the address. */
const EMAIL_LIKE = /^\S+@\S+\.\S+$/;

@Injectable()
export class SetupService {
  private readonly logger = new Logger(SetupService.name);

  /** Settings flag persisted after a successful setup wizard. */
  private static readonly SETUP_COMPLETED_KEY = 'setup.completed';

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Check if initial setup is needed.
   *
   * Short-circuits to `false` whenever the `setup.completed` flag is set in
   * the `config` table. This is the authoritative answer even when every
   * SUPER_ADMIN has been soft-deleted, preventing an attacker (or an
   * accidental admin purge) from re-triggering the wizard with the bootstrap
   * secret. To intentionally redo the setup, an operator must explicitly
   * remove this row through a DB-level intervention.
   */
  async needsSetup(): Promise<boolean> {
    const completedFlag = await this.prisma.client.config.findUnique({
      where: { key: SetupService.SETUP_COMPLETED_KEY },
      select: { value: true },
    });
    if (completedFlag?.value === 'true') {
      return false;
    }

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
    preferences?: {
      addonsTodolistEnabled?: boolean;
      language?: 'en' | 'fr';
      timezone?: string;
      ip?: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    const ip = preferences?.ip || 'unknown';

    this.logger.log(`[SECURITY] Setup initialization attempt — IP: ${ip}`);

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

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
          throw new ConflictException(
            'Setup already completed. Instance is already initialized.',
          );
        }

        // Create admin user
        const admin = await tx.user.create({
          data: {
            username,
            // The wizard asks for an email address and uses it as the username:
            // keep it as the email too, or the account looks like it has none.
            email: EMAIL_LIKE.test(username) ? username : null,
            fullname: 'Admin Local',
            passwordHash,
            role: 'SUPER_ADMIN',
            authProvider: 'LOCAL',
          },
          select: { id: true },
        });

        // Reuse the seeded default site when present; otherwise create it here.
        const defaultSite =
          (await tx.site.findFirst({
            where: {
              OR: [
                { id: 1 },
                { code: { equals: 'DEFAULT', mode: 'insensitive' } },
              ],
            },
            orderBy: { id: 'asc' },
            select: { id: true },
          })) ??
          (await tx.site.create({
            data: {
              name: 'Default',
              code: 'DEFAULT',
              description:
                'Site créé automatiquement lors du premier paramétrage.',
            },
            select: { id: true },
          }));

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

    // Choices made in the wizard go through the settings service, like any other
    // setting, so they are validated and stored in the one format everything reads.
    // A value the registry refuses must not undo a setup that already succeeded.
    const chosen: Record<string, unknown> = {
      'addons.todolist.enabled': preferences?.addonsTodolistEnabled !== false,
    };
    if (preferences?.language) chosen['ui.language'] = preferences.language;
    if (preferences?.timezone)
      chosen['scheduler.timezone'] = preferences.timezone;
    for (const [key, value] of Object.entries(chosen)) {
      try {
        await this.settings.set(key, value);
      } catch (error) {
        this.logger.warn(
          `Setup preference ${key} not saved: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Mark setup as completed so `needsSetup()` short-circuits afterwards
    // even if every SUPER_ADMIN ends up soft-deleted (AUDIT.md Finding #7).
    await this.prisma.client.config.upsert({
      where: { key: SetupService.SETUP_COMPLETED_KEY },
      create: { key: SetupService.SETUP_COMPLETED_KEY, value: 'true' },
      update: { value: 'true' },
    });

    return { success: true, message: 'Admin user created successfully' };
  }
}
