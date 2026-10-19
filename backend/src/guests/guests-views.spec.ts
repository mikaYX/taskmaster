import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GuestsService, type GuestActor } from './guests.service';

describe('GuestsService - one TV link per screen and site', () => {
  const user = { findFirst: jest.fn(), create: jest.fn() };
  const userSiteAssignment = { findMany: jest.fn(), create: jest.fn() };
  const site = { findUnique: jest.fn() };
  const prisma = { client: { user, userSiteAssignment, site } };
  const auth = { hashPassword: jest.fn(), logout: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new GuestsService(
    prisma as never,
    auth as never,
    audit as never,
    { issue: jest.fn() } as never,
  );

  const admin: GuestActor = { id: 1, username: 'root', role: 'SUPER_ADMIN' };
  const manager: GuestActor = { id: 10, username: 'mgr', role: 'MANAGER' };
  let nextId = 100;

  beforeEach(() => {
    jest.resetAllMocks();
    nextId = 100;
    auth.hashPassword.mockResolvedValue('hash');
    site.findUnique.mockResolvedValue({ id: 1, name: 'Atelier', code: 'ATL' });
    user.findFirst.mockResolvedValue(null); // nothing exists yet
    user.create.mockImplementation(async ({ data }) => ({
      id: nextId++,
      ...data,
    }));
    userSiteAssignment.findMany.mockResolvedValue([{ siteId: 1 }]);
  });

  it('creates only the board link by default, as before views existed', async () => {
    const created = await service.createForSite(1, admin);

    expect(created).toHaveLength(1);
    expect(user.create.mock.calls[0][0].data).toMatchObject({
      role: 'GUEST',
      guestView: 'DASHBOARD',
      fullname: 'TV Mode - Atelier',
    });
    expect(created[0].username).toMatch(/^guest_atl_\d+$/);
    expect(created[0].rawPassword).toMatch(/^[a-f0-9]{24}$/);
  });

  it('creates the analytics link alone when only that one is chosen', async () => {
    const created = await service.createForSite(1, admin, ['ANALYTICS']);

    expect(created).toHaveLength(1);
    expect(user.create.mock.calls[0][0].data).toMatchObject({
      guestView: 'ANALYTICS',
      fullname: 'TV Analytics - Atelier',
    });
    expect(created[0].username).toMatch(/^guest_atl_analytics_\d+$/);
  });

  it('creates both links in one go, as two separate accounts with their own passwords', async () => {
    const created = await service.createForSite(1, admin, [
      'DASHBOARD',
      'ANALYTICS',
    ]);

    expect(created.map((guest) => guest.guestView)).toEqual([
      'DASHBOARD',
      'ANALYTICS',
    ]);
    expect(new Set(created.map((guest) => guest.username)).size).toBe(2);
    expect(new Set(created.map((guest) => guest.rawPassword)).size).toBe(2);
    expect(userSiteAssignment.create).toHaveBeenCalledTimes(2);
    expect(audit.log).toHaveBeenCalledTimes(2);
  });

  it('ignores a view requested twice', async () => {
    const created = await service.createForSite(1, admin, [
      'ANALYTICS',
      'ANALYTICS',
    ]);

    expect(created).toHaveLength(1);
  });

  it('leaves alone a screen that already has its link and creates the missing one', async () => {
    // the board exists, the analytics does not
    user.findFirst.mockImplementation(async ({ where }) =>
      where.OR ? { id: 7, guestView: 'DASHBOARD' } : null,
    );

    const created = await service.createForSite(1, admin, [
      'DASHBOARD',
      'ANALYTICS',
    ]);

    expect(created.map((guest) => guest.guestView)).toEqual(['ANALYTICS']);
  });

  it('refuses when every requested link already exists', async () => {
    user.findFirst.mockResolvedValue({ id: 7 });

    await expect(
      service.createForSite(1, admin, ['DASHBOARD', 'ANALYTICS']),
    ).rejects.toThrow(ConflictException);
    expect(user.create).not.toHaveBeenCalled();
  });

  it('counts an old account without a view as the board link', async () => {
    await service.createForSite(1, admin, ['DASHBOARD']);

    // the lookup for the board accepts a null view, the one for analytics does not
    const boardLookup = user.findFirst.mock.calls[0][0].where;
    expect(boardLookup.OR).toEqual([
      { guestView: 'DASHBOARD' },
      { guestView: null },
    ]);

    await service.createForSite(1, admin, ['ANALYTICS']);
    const analyticsLookup = user.findFirst.mock.calls[1][0].where;
    expect(analyticsLookup.guestView).toBe('ANALYTICS');
    expect(analyticsLookup.OR).toBeUndefined();
  });

  it('keeps a manager to their own sites, before any lookup', async () => {
    userSiteAssignment.findMany.mockResolvedValue([{ siteId: 2 }]);

    await expect(
      service.createForSite(1, manager, ['DASHBOARD', 'ANALYTICS']),
    ).rejects.toThrow(ForbiddenException);
    expect(site.findUnique).not.toHaveBeenCalled();
    expect(user.create).not.toHaveBeenCalled();
  });

  it('lets a manager create both links on their site', async () => {
    const created = await service.createForSite(1, manager, [
      'DASHBOARD',
      'ANALYTICS',
    ]);

    expect(created).toHaveLength(2);
  });

  it('reports an unknown site', async () => {
    site.findUnique.mockResolvedValue(null);

    await expect(
      service.createForSite(9, admin, ['ANALYTICS']),
    ).rejects.toThrow(NotFoundException);
  });
});
