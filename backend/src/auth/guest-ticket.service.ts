import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import Redis from 'ioredis';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { AuthService } from './auth.service';

const TICKET_PREFIX = 'guest_ticket:';
const CURRENT_PREFIX = 'guest_ticket_current:';

/** An admin generates the link, then opens it on the TV: a day is plenty. */
export const GUEST_TICKET_TTL_SECONDS = 24 * 60 * 60;

/**
 * One-time login links for TV (GUEST) screens.
 *
 * A screen on a wall cannot type a password and must never see one in its URL
 * (history, proxy logs, Referer...). Instead an administrator asks for a
 * ticket, opens `/login?guest_ticket=...` once on the screen, and the server
 * swaps it for a long session. The ticket:
 * - is random (256 bits) and stored only as a SHA-256 hash;
 * - works once, for one guest, for at most a day;
 * - is replaced when a new one is issued for the same guest, so there is never
 *   more than one pending link per screen.
 */
@Injectable()
export class GuestTicketService {
  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  private hash(ticket: string): string {
    return crypto.createHash('sha256').update(ticket).digest('hex');
  }

  async issue(guestId: number): Promise<{ ticket: string; expiresAt: Date }> {
    const ticket = crypto.randomBytes(32).toString('hex');
    const hash = this.hash(ticket);

    // A newer link cancels the previous one that was never used.
    const previous = await this.redis.get(`${CURRENT_PREFIX}${guestId}`);
    if (previous) await this.redis.del(`${TICKET_PREFIX}${previous}`);

    await this.redis.set(
      `${TICKET_PREFIX}${hash}`,
      JSON.stringify({ guestId }),
      'EX',
      GUEST_TICKET_TTL_SECONDS,
    );
    await this.redis.set(
      `${CURRENT_PREFIX}${guestId}`,
      hash,
      'EX',
      GUEST_TICKET_TTL_SECONDS,
    );

    return {
      ticket,
      expiresAt: new Date(Date.now() + GUEST_TICKET_TTL_SECONDS * 1000),
    };
  }

  /** Returns the guest id the ticket was issued for and burns it. */
  async consume(ticket: string): Promise<number> {
    const hash = this.hash(ticket);
    const key = `${TICKET_PREFIX}${hash}`;

    // GET + DEL in one transaction: two simultaneous uses cannot both win.
    const results = await this.redis.multi().get(key).del(key).exec();
    const raw = results?.[0]?.[1];
    if (typeof raw !== 'string') {
      throw new UnauthorizedException('Invalid or expired link');
    }

    let guestId: unknown;
    try {
      guestId = (JSON.parse(raw) as { guestId?: unknown }).guestId;
    } catch {
      guestId = undefined;
    }
    if (typeof guestId !== 'number') {
      throw new UnauthorizedException('Invalid or expired link');
    }

    const current = await this.redis.get(`${CURRENT_PREFIX}${guestId}`);
    if (current === hash) await this.redis.del(`${CURRENT_PREFIX}${guestId}`);

    return guestId;
  }

  /**
   * Swaps a ticket for a session. Only a live GUEST account can be signed in
   * this way, whatever id the ticket carries.
   */
  async login(ticket: string, userAgent?: string, ipAddress?: string) {
    const guestId = await this.consume(ticket);
    const guest = await this.prisma.client.user.findFirst({
      where: { id: guestId, role: UserRole.GUEST, deletedAt: null },
      select: { id: true },
    });
    if (!guest) {
      throw new UnauthorizedException('Invalid or expired link');
    }
    return this.authService.completeLogin(guest.id, userAgent, ipAddress);
  }
}
