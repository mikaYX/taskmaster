import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { GuestView, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuditAction, AuditCategory } from '../audit/audit.constants';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth';
import { GuestTicketService } from '../auth/guest-ticket.service';
import { PrismaService } from '../prisma';

/** Caller of a guest-link operation; `role` is absent for trusted internal callers. */
export interface GuestActor {
  id: number;
  username: string;
  role?: string;
}

@Injectable()
export class GuestsService {
  private readonly logger = new Logger(GuestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly guestTickets: GuestTicketService,
  ) {}

  /**
   * A manager only handles guest links of the sites they are assigned to;
   * super administrators handle all of them. Without a role (internal
   * caller) nothing is restricted.
   */
  private async assertSiteAccess(
    actor: GuestActor | undefined,
    siteIds: number[] | (() => Promise<number[]>),
  ): Promise<void> {
    if (!actor?.role || actor.role === 'SUPER_ADMIN') return;
    if (actor.role !== 'MANAGER') {
      throw new ForbiddenException('Insufficient privileges.');
    }
    const mine = await this.getManagerSiteIds(actor.id);
    const target = typeof siteIds === 'function' ? await siteIds() : siteIds;
    if (!target.some((siteId) => mine.includes(siteId))) {
      throw new ForbiddenException('This site is not one of your sites.');
    }
  }

  private async getManagerSiteIds(userId: number): Promise<number[]> {
    const rows = await this.prisma.client.userSiteAssignment.findMany({
      where: { userId },
      select: { siteId: true },
    });
    return rows.map((row) => row.siteId);
  }

  private async getGuestSiteIds(guestId: number): Promise<number[]> {
    return this.getManagerSiteIds(guestId);
  }

  /**
   * Get guest for a specific site.
   */
  async findBySite(siteId: number, actor?: GuestActor, view?: GuestView) {
    await this.assertSiteAccess(actor, [siteId]);
    return this.prisma.client.user.findFirst({
      where: {
        role: UserRole.GUEST,
        deletedAt: null,
        sites: {
          some: {
            siteId: siteId,
          },
        },
        // An account created before views existed has none and shows the board.
        ...(view === GuestView.DASHBOARD
          ? { OR: [{ guestView: GuestView.DASHBOARD }, { guestView: null }] }
          : view
            ? { guestView: view }
            : {}),
      },
    });
  }

  /**
   * Create the TV accounts of a site: one per requested screen (task board,
   * analytics, or both). A site holds at most one of each; a screen that already
   * has its account is left alone.
   */
  async createForSite(
    siteId: number,
    actor: GuestActor,
    views: GuestView[] = [GuestView.DASHBOARD],
  ) {
    await this.assertSiteAccess(actor, [siteId]);

    // 1. Check site existence
    const site = await this.prisma.client.site.findUnique({
      where: { id: siteId },
    });
    if (!site) {
      throw new NotFoundException(`Site with ID ${siteId} not found`);
    }

    const created: Array<
      Awaited<ReturnType<typeof this.prisma.client.user.create>> & {
        rawPassword: string;
      }
    > = [];

    for (const view of [...new Set(views)]) {
      // 2. A site holds at most one account per screen
      if (await this.findBySite(siteId, undefined, view)) continue;

      // 3. Generate credentials
      const timestamp = Date.now();
      const suffix = view === GuestView.ANALYTICS ? '_analytics' : '';
      const username = `guest_${site.code.toLowerCase()}${suffix}_${timestamp}`;
      const password = randomBytes(12).toString('hex');
      const passwordHash = await this.authService.hashPassword(password);

      // 4. Create user
      const guest = await this.prisma.client.user.create({
        data: {
          username,
          fullname: `${view === GuestView.ANALYTICS ? 'TV Analytics' : 'TV Mode'} - ${site.name}`,
          email: `${username}@tv.local`,
          passwordHash,
          role: UserRole.GUEST,
          guestView: view,
          authProvider: 'LOCAL',
          mustChangePassword: false, // Guests don't change passwords
        },
      });

      // 5. Assign to site
      await this.prisma.client.userSiteAssignment.create({
        data: {
          userId: guest.id,
          siteId: siteId,
          isDefault: true,
        },
      });

      await this.auditService.log({
        action: AuditAction.USER_CREATED,
        actorId: actor.id,
        actorName: actor.username,
        target: `User:${guest.id}`,
        category: AuditCategory.USER,
        details: {
          site: site.name,
          view,
          message: 'Guest created for site',
        },
      });

      this.logger.log(
        `Guest (${view}) created for site ${siteId}: ${username}`,
      );

      created.push({
        ...guest,
        rawPassword: password, // Only returned once
      });
    }

    if (created.length === 0) {
      throw new ConflictException(
        `The requested TV link(s) already exist for site ${site.name}`,
      );
    }

    return created;
  }

  /**
   * Regenerate password for a guest.
   */
  async regeneratePassword(id: number, actor: GuestActor) {
    const guest = await this.prisma.client.user.findFirst({
      where: { id, role: UserRole.GUEST, deletedAt: null },
    });

    if (!guest) {
      throw new NotFoundException(`Guest with ID ${id} not found`);
    }
    await this.assertSiteAccess(actor, () => this.getGuestSiteIds(id));

    const newPassword = randomBytes(12).toString('hex');
    const passwordHash = await this.authService.hashPassword(newPassword);

    await this.prisma.client.user.update({
      where: { id },
      data: { passwordHash },
    });
    // Whoever held the old password or an open TV session is signed out.
    await this.authService.logout(id);

    await this.auditService.log({
      action: AuditAction.USER_PASSWORD_CHANGED,
      actorId: actor.id,
      actorName: actor.username,
      target: `User:${id}`,
      category: AuditCategory.USER,
      details: { message: 'Guest password regenerated' },
    });

    return {
      success: true,
      newPassword,
    };
  }

  /**
   * One-time login link for a TV screen (see GuestTicketService). Replaces any
   * link of that screen that was never used.
   */
  async createLoginLink(id: number, actor: GuestActor) {
    const guest = await this.prisma.client.user.findFirst({
      where: { id, role: UserRole.GUEST, deletedAt: null },
    });
    if (!guest) {
      throw new NotFoundException(`Guest with ID ${id} not found`);
    }
    await this.assertSiteAccess(actor, () => this.getGuestSiteIds(id));

    const { ticket, expiresAt } = await this.guestTickets.issue(id);

    await this.auditService.log({
      action: AuditAction.USER_UPDATED,
      actorId: actor.id,
      actorName: actor.username,
      target: `User:${id}`,
      category: AuditCategory.USER,
      details: { message: 'Guest TV login link issued' },
    });

    return { ticket, expiresAt };
  }

  /**
   * Revoke (soft-delete) a guest.
   */
  async revoke(id: number, actor: GuestActor) {
    const guest = await this.prisma.client.user.findFirst({
      where: { id, role: UserRole.GUEST, deletedAt: null },
    });

    if (!guest) {
      throw new NotFoundException(`Guest with ID ${id} not found`);
    }
    await this.assertSiteAccess(actor, () => this.getGuestSiteIds(id));

    await this.prisma.client.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    await this.auditService.log({
      action: AuditAction.USER_DELETED,
      actorId: actor.id,
      actorName: actor.username,
      target: `User:${id}`,
      category: AuditCategory.USER,
    });

    this.logger.log(`Guest revoked: ${id}`);
    return { success: true };
  }

  async listGuests(actor?: GuestActor) {
    const where: Record<string, unknown> = {
      role: UserRole.GUEST,
      deletedAt: null,
    };
    if (actor?.role && actor.role !== 'SUPER_ADMIN') {
      if (actor.role !== 'MANAGER') return [];
      where.sites = {
        some: { siteId: { in: await this.getManagerSiteIds(actor.id) } },
      };
    }
    return this.prisma.client.user.findMany({
      where,
      include: {
        sites: {
          include: {
            site: { select: { name: true, code: true } },
          },
        },
      },
    });
  }
}
