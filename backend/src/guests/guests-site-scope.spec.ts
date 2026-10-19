import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuestsService, type GuestActor } from './guests.service';

describe('GuestsService - manager scope', () => {
  const user = { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() };
  const userSiteAssignment = { findMany: jest.fn() };
  const site = { findUnique: jest.fn() };
  const prisma = { client: { user, userSiteAssignment, site } };
  const auth = {
    hashPassword: jest.fn().mockResolvedValue('hash'),
    logout: jest.fn().mockResolvedValue(undefined),
  };
  const guestTickets = { issue: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new GuestsService(
    prisma as never,
    auth as never,
    audit as never,
    guestTickets as never,
  );

  const manager: GuestActor = { id: 10, username: 'mgr', role: 'MANAGER' };
  const admin: GuestActor = { id: 1, username: 'root', role: 'SUPER_ADMIN' };

  /** Site assignments by user id. */
  const sites: Record<number, number[]> = {};

  beforeEach(() => {
    jest.resetAllMocks();
    auth.hashPassword.mockResolvedValue('hash');
    auth.logout.mockResolvedValue(undefined);
    for (const key of Object.keys(sites)) delete sites[Number(key)];
    sites[manager.id] = [1];
    userSiteAssignment.findMany.mockImplementation(
      async ({ where }: { where: { userId: number } }) =>
        (sites[where.userId] ?? []).map((siteId) => ({ siteId })),
    );
    user.findFirst.mockResolvedValue({ id: 50, role: 'GUEST' });
    user.update.mockResolvedValue({});
  });

  it.each([
    ['regenerate', (a: GuestActor) => service.regeneratePassword(50, a)],
    ['revoke', (a: GuestActor) => service.revoke(50, a)],
  ])('%s: refuses a manager on a guest of another site', async (_name, run) => {
    sites[50] = [2];

    await expect(run(manager)).rejects.toThrow(ForbiddenException);
    expect(user.update).not.toHaveBeenCalled();
  });

  it.each([
    ['regenerate', (a: GuestActor) => service.regeneratePassword(50, a)],
    ['revoke', (a: GuestActor) => service.revoke(50, a)],
  ])('%s: allows a manager on a guest of their site', async (_name, run) => {
    sites[50] = [1];

    await expect(run(manager)).resolves.toBeDefined();
    expect(user.update).toHaveBeenCalled();
  });

  it('refuses creating a guest link on a foreign site, before any lookup', async () => {
    await expect(service.createForSite(2, manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(site.findUnique).not.toHaveBeenCalled();
  });

  it('refuses reading the guest of a foreign site', async () => {
    await expect(service.findBySite(2, manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(user.findFirst).not.toHaveBeenCalled();
  });

  it('lists only the guests of the manager sites', async () => {
    user.findMany.mockResolvedValue([]);

    await service.listGuests(manager);

    expect(user.findMany.mock.calls[0][0].where).toEqual({
      role: 'GUEST',
      deletedAt: null,
      sites: { some: { siteId: { in: [1] } } },
    });
  });

  it('does not restrict a super administrator', async () => {
    sites[50] = [9];
    user.findMany.mockResolvedValue([]);

    await expect(service.revoke(50, admin)).resolves.toBeDefined();
    await service.listGuests(admin);

    expect(user.findMany.mock.calls[0][0].where).toEqual({
      role: 'GUEST',
      deletedAt: null,
    });
    expect(userSiteAssignment.findMany).not.toHaveBeenCalled();
  });

  it('refuses a role that cannot manage guests', async () => {
    sites[50] = [1];

    await expect(
      service.revoke(50, { id: 5, username: 'u', role: 'USER' }),
    ).rejects.toThrow(ForbiddenException);
  });

  describe('TV login link', () => {
    const expiresAt = new Date('2026-10-20T10:00:00Z');

    beforeEach(() => {
      guestTickets.issue.mockResolvedValue({
        ticket: 'a'.repeat(64),
        expiresAt,
      });
    });

    it('issues a one-time link for a guest of the manager site and audits it', async () => {
      sites[50] = [1];

      await expect(service.createLoginLink(50, manager)).resolves.toEqual({
        ticket: 'a'.repeat(64),
        expiresAt,
      });

      expect(guestTickets.issue).toHaveBeenCalledWith(50);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ target: 'User:50', actorId: manager.id }),
      );
    });

    it('refuses a manager on the guest of another site, without issuing anything', async () => {
      sites[50] = [2];

      await expect(service.createLoginLink(50, manager)).rejects.toThrow(
        ForbiddenException,
      );
      expect(guestTickets.issue).not.toHaveBeenCalled();
    });

    it('refuses an account that is not a live guest (no link to an administrator)', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(service.createLoginLink(1, admin)).rejects.toThrow(
        NotFoundException,
      );
      expect(guestTickets.issue).not.toHaveBeenCalled();
    });

    it('lets a super administrator issue a link for any screen', async () => {
      sites[50] = [9];

      await expect(service.createLoginLink(50, admin)).resolves.toBeDefined();
    });
  });

  it('signs the screen out when its password is regenerated', async () => {
    sites[50] = [1];

    await service.regeneratePassword(50, manager);

    expect(auth.logout).toHaveBeenCalledWith(50);
  });
});
