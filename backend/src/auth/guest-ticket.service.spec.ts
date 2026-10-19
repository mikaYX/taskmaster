import { UnauthorizedException } from '@nestjs/common';
import { GuestTicketService } from './guest-ticket.service';

/** Just enough of ioredis for the ticket store (transactions run in order). */
class FakeRedis {
  readonly store = new Map<string, string>();
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.store.set(key, value);
    return 'OK';
  }
  async del(...keys: string[]) {
    return keys.filter((key) => this.store.delete(key)).length;
  }
  multi() {
    const ops: Array<() => Promise<unknown>> = [];
    const chain = {
      get: (key: string) => (ops.push(() => this.get(key)), chain),
      del: (key: string) => (ops.push(() => this.del(key)), chain),
      exec: async () => {
        const out: Array<[null, unknown]> = [];
        for (const op of ops) out.push([null, await op()]);
        return out;
      },
    };
    return chain;
  }
}

describe('GuestTicketService', () => {
  const prisma = { client: { user: { findFirst: jest.fn() } } };
  const authService = { completeLogin: jest.fn() };
  let redis: FakeRedis;
  let service: GuestTicketService;

  beforeEach(() => {
    jest.resetAllMocks();
    redis = new FakeRedis();
    service = new GuestTicketService(
      redis as never,
      prisma as never,
      authService as never,
    );
  });

  it('issues a 256-bit ticket and stores only its hash', async () => {
    const { ticket, expiresAt } = await service.issue(9);

    expect(ticket).toMatch(/^[a-f0-9]{64}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 3600_000);
    const stored = JSON.stringify([...redis.store.entries()]);
    expect(stored).not.toContain(ticket);
  });

  it('works once: the second use is refused', async () => {
    const { ticket } = await service.issue(9);

    await expect(service.consume(ticket)).resolves.toBe(9);
    await expect(service.consume(ticket)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('refuses an unknown or malformed ticket', async () => {
    await expect(service.consume('0'.repeat(64))).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.consume('not-a-ticket')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('cancels the previous unused link when a new one is issued for the same screen', async () => {
    const first = await service.issue(9);
    const second = await service.issue(9);

    await expect(service.consume(first.ticket)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(service.consume(second.ticket)).resolves.toBe(9);
  });

  it('keeps the links of different screens independent', async () => {
    const a = await service.issue(1);
    const b = await service.issue(2);

    await expect(service.consume(a.ticket)).resolves.toBe(1);
    await expect(service.consume(b.ticket)).resolves.toBe(2);
  });

  it('leaves no pending-link marker behind once the ticket is used', async () => {
    const { ticket } = await service.issue(9);
    await service.consume(ticket);

    expect([...redis.store.keys()]).toEqual([]);
  });

  describe('login', () => {
    it('signs a live guest in with the request context', async () => {
      prisma.client.user.findFirst.mockResolvedValue({ id: 9 });
      authService.completeLogin.mockResolvedValue({ role: 'GUEST' });
      const { ticket } = await service.issue(9);

      await expect(
        service.login(ticket, 'tv-browser', '10.0.0.8'),
      ).resolves.toEqual({
        role: 'GUEST',
      });

      expect(prisma.client.user.findFirst).toHaveBeenCalledWith({
        where: { id: 9, role: 'GUEST', deletedAt: null },
        select: { id: true },
      });
      expect(authService.completeLogin).toHaveBeenCalledWith(
        9,
        'tv-browser',
        '10.0.0.8',
      );
    });

    it('never signs in an account that is not a live guest (revoked, or not a TV account)', async () => {
      prisma.client.user.findFirst.mockResolvedValue(null);
      const { ticket } = await service.issue(1);

      await expect(service.login(ticket)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(authService.completeLogin).not.toHaveBeenCalled();
      // and the link is burnt either way
      await expect(service.consume(ticket)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
