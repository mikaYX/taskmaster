import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GroupsService } from './groups.service';

describe('GroupsService - manager scope', () => {
  const group = {
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  };
  const user = { findMany: jest.fn(), count: jest.fn() };
  const userGroupMembership = { createMany: jest.fn(), deleteMany: jest.fn() };
  const userSiteAssignment = { findMany: jest.fn() };
  const current = {
    user: undefined as undefined | { id: number; role: string; sites: [] },
  };
  const prisma = {
    client: { group, user, userGroupMembership, userSiteAssignment },
    getCurrentUser: () => current.user,
    buildSiteFilter: jest.fn().mockReturnValue({}),
    getUserSiteIds: jest.fn().mockReturnValue([]),
    getDefaultSiteId: jest.fn().mockReturnValue(1),
  };
  const service = new GroupsService(prisma as never);

  const groupOf = (siteId: number, overrides = {}) => ({
    id: 5,
    name: 'Equipe',
    isSystem: false,
    description: null,
    siteId,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    site: { id: siteId, name: 'S', code: 'S' },
    _count: { members: 0 },
    members: [],
    ...overrides,
  });

  const asManager = (siteIds: number[]) => {
    current.user = { id: 10, role: 'MANAGER', sites: [] };
    userSiteAssignment.findMany.mockResolvedValue(
      siteIds.map((siteId) => ({ siteId })),
    );
  };

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.buildSiteFilter.mockReturnValue({});
    prisma.getUserSiteIds.mockReturnValue([]);
    group.update.mockResolvedValue(groupOf(1));
    userGroupMembership.createMany.mockResolvedValue({ count: 1 });
    userGroupMembership.deleteMany.mockResolvedValue({ count: 1 });
    current.user = undefined;
  });

  describe.each([
    ['update', () => service.update(5, { name: 'Renamed' })],
    ['remove', () => service.remove(5)],
    ['addMembers', () => service.addMembers(5, [7])],
    ['removeMembers', () => service.removeMembers(5, [7])],
    ['getMembers', () => service.getMembers(5)],
    ['findOne', () => service.findOne(5)],
  ])('%s', (_name, run) => {
    it('refuses a manager on a group of another site, whatever they send', async () => {
      asManager([1]);
      group.findFirst.mockResolvedValue(groupOf(2));

      await expect(run()).rejects.toThrow(
        /does not belong to one of your sites/,
      );
      expect(group.update).not.toHaveBeenCalled();
      expect(userGroupMembership.createMany).not.toHaveBeenCalled();
      expect(userGroupMembership.deleteMany).not.toHaveBeenCalled();
    });

    it('refuses a manager attached to no site at all', async () => {
      asManager([]);
      group.findFirst.mockResolvedValue(groupOf(1));

      await expect(run()).rejects.toThrow(ForbiddenException);
    });
  });

  describe('on the manager own site', () => {
    beforeEach(() => {
      asManager([1, 4]);
      group.findFirst.mockResolvedValue(groupOf(1));
      user.findMany.mockResolvedValue([{ id: 7 }]);
      user.count.mockResolvedValue(1);
    });

    it('lets a manager rename, delete, and remove members', async () => {
      // update() looks the group up, then checks that the new name is free.
      group.findFirst
        .mockResolvedValueOnce(groupOf(1))
        .mockResolvedValueOnce(null);
      await expect(
        service.update(5, { name: 'Renamed' }),
      ).resolves.toBeDefined();

      group.findFirst.mockResolvedValue(groupOf(1));
      await expect(service.remove(5)).resolves.toBeUndefined();
      await expect(service.removeMembers(5, [7])).resolves.toBeDefined();
    });

    it('adds people who are attached to the site of the group, as USER or MANAGER only', async () => {
      await expect(service.addMembers(5, [7])).resolves.toBeDefined();

      expect(user.count).toHaveBeenCalledWith({
        where: {
          id: { in: [7] },
          deletedAt: null,
          role: { in: ['USER', 'MANAGER'] },
          sites: { some: { siteId: 1 } },
        },
      });
      expect(userGroupMembership.createMany).toHaveBeenCalled();
    });

    it('refuses to add someone who is not on the site, or is an administrator or a TV account', async () => {
      user.count.mockResolvedValue(0);

      await expect(service.addMembers(5, [7])).rejects.toThrow(
        /attached to the group's site/,
      );
      expect(userGroupMembership.createMany).not.toHaveBeenCalled();
    });

    it('does not count duplicated ids twice when checking eligibility', async () => {
      user.findMany.mockResolvedValue([{ id: 7 }, { id: 7 }]);
      user.count.mockResolvedValue(1);

      await expect(service.addMembers(5, [7, 7])).resolves.toBeDefined();
    });
  });

  it('does not restrict a super administrator (no database lookup of sites)', async () => {
    current.user = { id: 1, role: 'SUPER_ADMIN', sites: [] };
    user.findMany.mockResolvedValue([{ id: 7 }]);

    group.findFirst
      .mockResolvedValueOnce(groupOf(9))
      .mockResolvedValueOnce(null);
    await expect(service.update(5, { name: 'Renamed' })).resolves.toBeDefined();

    group.findFirst.mockResolvedValue(groupOf(9));
    await expect(service.addMembers(5, [7])).resolves.toBeDefined();

    expect(userSiteAssignment.findMany).not.toHaveBeenCalled();
    expect(user.count).not.toHaveBeenCalled();
  });

  it('still reports a missing group before any site check', async () => {
    asManager([1]);
    group.findFirst.mockResolvedValue(null);

    await expect(service.update(5, { name: 'x' })).rejects.toThrow(
      NotFoundException,
    );
    expect(userSiteAssignment.findMany).not.toHaveBeenCalled();
  });
});
