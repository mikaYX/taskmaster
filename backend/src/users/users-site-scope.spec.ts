import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService, type UserActor } from './users.service';

describe('UsersService - manager scope', () => {
  const user = {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };
  const userSiteAssignment = { findMany: jest.fn(), create: jest.fn() };
  const prisma = {
    client: { user, userSiteAssignment },
    getDefaultSiteId: jest.fn(),
  };
  const auth = {
    hashPassword: jest.fn().mockResolvedValue('hash'),
    invalidateSession: jest.fn().mockResolvedValue(undefined),
  };
  const audit = { log: jest.fn(), logDiff: jest.fn() };
  const service = new UsersService(
    prisma as never,
    auth as never,
    audit as never,
    {} as never,
  );

  const manager: UserActor = { id: 10, username: 'mgr', role: 'MANAGER' };
  const admin: UserActor = { id: 1, username: 'root', role: 'SUPER_ADMIN' };

  /** Site assignments by user id. */
  const sites: Record<number, number[]> = {};
  const setTarget = (id: number, role: string, siteIds: number[]) => {
    sites[id] = siteIds;
    user.findFirst.mockResolvedValue({
      id,
      username: `u${id}`,
      role,
      authProvider: 'LOCAL',
      deletedAt: null,
    });
  };

  beforeEach(() => {
    jest.resetAllMocks();
    auth.hashPassword.mockResolvedValue('hash');
    auth.invalidateSession.mockResolvedValue(undefined);
    for (const key of Object.keys(sites)) delete sites[Number(key)];
    sites[manager.id] = [1];
    userSiteAssignment.findMany.mockImplementation(
      async ({ where }: { where: { userId: number } }) =>
        (sites[where.userId] ?? []).map((siteId) => ({ siteId })),
    );
    user.update.mockResolvedValue({ id: 2, groupMemberships: [] });
  });

  describe.each([
    [
      'resetPassword',
      (id: number, a?: UserActor) =>
        service.resetPassword(id, 'N3w!Passw0rd#', a),
    ],
    ['remove', (id: number, a?: UserActor) => service.remove(id, a)],
    [
      'update',
      (id: number, a?: UserActor) => service.update(id, { fullname: 'X' }, a),
    ],
  ])('%s', (_name, run) => {
    it('refuses a manager acting on a SUPER_ADMIN, whatever the site', async () => {
      setTarget(2, 'SUPER_ADMIN', [1]);

      await expect(run(2, manager)).rejects.toThrow(ForbiddenException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('refuses a manager acting on an account of another site', async () => {
      setTarget(2, 'USER', [2]);

      await expect(run(2, manager)).rejects.toThrow(
        /does not belong to one of your sites/,
      );
      expect(user.update).not.toHaveBeenCalled();
    });

    it('refuses a manager acting on an account without any site', async () => {
      setTarget(2, 'USER', []);

      await expect(run(2, manager)).rejects.toThrow(ForbiddenException);
    });

    it('allows a manager on a USER of their site', async () => {
      setTarget(2, 'USER', [1, 3]);

      await expect(run(2, manager)).resolves.not.toThrow();
      expect(user.update).toHaveBeenCalled();
    });

    it('allows a manager on another MANAGER of their site', async () => {
      setTarget(2, 'MANAGER', [1]);

      await expect(run(2, manager)).resolves.not.toThrow();
    });

    it('lets a SUPER_ADMIN act on anyone without consulting sites', async () => {
      setTarget(2, 'SUPER_ADMIN', [9]);

      await expect(run(2, admin)).resolves.not.toThrow();
      expect(userSiteAssignment.findMany).not.toHaveBeenCalled();
    });

    it('refuses any other role', async () => {
      setTarget(2, 'USER', [1]);

      await expect(
        run(2, { id: 5, username: 'u', role: 'USER' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  it('refuses a manager managing a guest link account', async () => {
    setTarget(2, 'GUEST', [1]);

    await expect(
      service.resetPassword(2, 'N3w!Passw0rd#', manager),
    ).rejects.toThrow(/administrator or guest/);
  });

  it('applies the same scope to restore', async () => {
    sites[2] = [2];
    user.findFirst.mockResolvedValue({
      id: 2,
      role: 'USER',
      deletedAt: new Date(),
    });

    await expect(service.restore(2, manager)).rejects.toThrow(
      ForbiddenException,
    );
    expect(user.update).not.toHaveBeenCalled();
  });

  describe('a deleted account', () => {
    const deletedUser = (siteIds: number[], role = 'USER') => {
      sites[2] = siteIds;
      user.findFirst.mockResolvedValue({
        id: 2,
        username: 'gone@example.com',
        role,
        authProvider: 'LOCAL',
        deletedAt: new Date(),
      });
    };

    it.each([
      [
        'has no password reset',
        () => service.resetPassword(2, 'N3w!Passw0rd#', manager),
      ],
      ['cannot be edited', () => service.update(2, { fullname: 'X' }, manager)],
    ])('%s: it must be restored first', async (_label, run) => {
      deletedUser([1]);

      await expect(run()).rejects.toThrow(/deleted. Restore it/);
      await expect(run()).rejects.toBeInstanceOf(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
      expect(auth.invalidateSession).not.toHaveBeenCalled();
    });

    it('applies to a super administrator too', async () => {
      deletedUser([9]);

      await expect(
        service.resetPassword(2, 'N3w!Passw0rd#', admin),
      ).rejects.toThrow(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('does not tell a manager that an account of another site is deleted', async () => {
      deletedUser([2]);

      await expect(
        service.resetPassword(2, 'N3w!Passw0rd#', manager),
      ).rejects.toThrow(/does not belong to one of your sites/);
    });

    it('can still be restored by the manager of its site', async () => {
      user.findFirst.mockResolvedValue({
        id: 2,
        role: 'USER',
        deletedAt: new Date(),
      });
      sites[2] = [1];
      user.update.mockResolvedValue({ id: 2, groupMemberships: [] });

      await expect(service.restore(2, manager)).resolves.toBeDefined();
    });

    it('is reported as missing when the id does not exist at all', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword(99, 'N3w!Passw0rd#', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('a deleted account', () => {
    const deletedUser = (siteIds: number[], role = 'USER') => {
      sites[2] = siteIds;
      user.findFirst.mockResolvedValue({
        id: 2,
        username: 'gone@example.com',
        role,
        authProvider: 'LOCAL',
        deletedAt: new Date(),
      });
    };

    it.each([
      [
        'has no password reset',
        () => service.resetPassword(2, 'N3w!Passw0rd#', manager),
      ],
      ['cannot be edited', () => service.update(2, { fullname: 'X' }, manager)],
    ])('%s: it must be restored first', async (_label, run) => {
      deletedUser([1]);

      await expect(run()).rejects.toThrow(/is deleted\. Restore it/);
      await expect(run()).rejects.toBeInstanceOf(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
      expect(auth.invalidateSession).not.toHaveBeenCalled();
    });

    it('applies to a super administrator too', async () => {
      deletedUser([9]);

      await expect(
        service.resetPassword(2, 'N3w!Passw0rd#', admin),
      ).rejects.toThrow(ConflictException);
      expect(user.update).not.toHaveBeenCalled();
    });

    it('does not tell a manager that an account of another site is deleted', async () => {
      deletedUser([2]);

      await expect(
        service.resetPassword(2, 'N3w!Passw0rd#', manager),
      ).rejects.toThrow(/does not belong to one of your sites/);
    });

    it('can still be restored by the manager of its site', async () => {
      user.findFirst.mockResolvedValue({
        id: 2,
        role: 'USER',
        deletedAt: new Date(),
      });
      sites[2] = [1];
      user.update.mockResolvedValue({ id: 2, groupMemberships: [] });

      await expect(service.restore(2, manager)).resolves.toBeDefined();
    });

    it('is reported as missing when the id does not exist at all', async () => {
      user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword(99, 'N3w!Passw0rd#', admin),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto = {
      username: 'new@example.com',
      email: 'new@example.com',
      password: 'Str0ng!Passw0rd',
      role: 'USER' as const,
    };

    beforeEach(() => {
      user.findUnique.mockResolvedValue(null);
      user.create.mockResolvedValue({
        id: 20,
        username: dto.username,
        role: 'USER',
        groupMemberships: [],
      });
    });

    it('attaches the new account to the manager site by default', async () => {
      prisma.getDefaultSiteId.mockReturnValue(undefined);

      await service.create(dto, manager);

      expect(userSiteAssignment.create).toHaveBeenCalledWith({
        data: { userId: 20, siteId: 1, isDefault: true },
      });
    });

    it('lets a manager create another manager on their site', async () => {
      await service.create({ ...dto, role: 'MANAGER' }, manager);

      expect(user.create).toHaveBeenCalled();
    });

    it('refuses a site the manager does not belong to, before creating anything', async () => {
      await expect(
        service.create({ ...dto, siteId: 2 }, manager),
      ).rejects.toThrow(/own sites/);
      expect(user.create).not.toHaveBeenCalled();
    });

    it('refuses a manager without any site', async () => {
      sites[manager.id] = [];

      await expect(service.create(dto, manager)).rejects.toThrow(
        ForbiddenException,
      );
      expect(user.create).not.toHaveBeenCalled();
    });

    it('does not create an account when no site can be resolved', async () => {
      prisma.getDefaultSiteId.mockReturnValue(undefined);

      await expect(service.create(dto, admin)).rejects.toThrow(/no siteId/);
      expect(user.create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    beforeEach(() => user.findMany.mockResolvedValue([]));

    it('scopes a manager to USER/MANAGER accounts of their sites', async () => {
      sites[manager.id] = [1, 4];

      await service.findAll({ manageableBy: manager });

      expect(user.findMany.mock.calls[0][0].where).toEqual({
        deletedAt: null,
        role: { in: ['USER', 'MANAGER'] },
        sites: { some: { siteId: { in: [1, 4] } } },
      });
    });

    it('does not scope a SUPER_ADMIN', async () => {
      await service.findAll({ manageableBy: admin });

      expect(user.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
    });

    it('includes soft-deleted accounts only on request', async () => {
      await service.findAll({ includeDeleted: true, manageableBy: admin });

      expect(user.findMany.mock.calls[0][0].where).toEqual({});
    });

    it('keeps the unscoped default listing unchanged', async () => {
      await service.findAll();

      expect(user.findMany.mock.calls[0][0].where).toEqual({ deletedAt: null });
    });

    it('returns nothing for a role that cannot manage users', async () => {
      await expect(
        service.findAll({
          manageableBy: { id: 5, username: 'u', role: 'USER' },
        }),
      ).resolves.toEqual([]);
      expect(user.findMany).not.toHaveBeenCalled();
    });
  });
});

describe('UsersController - deleted users listing', () => {
  const usersService = { findAll: jest.fn().mockResolvedValue([]) };
  const controller = new UsersController(usersService as never, {} as never);
  const jwt = (role: string) => ({ sub: 7, username: 'u', role }) as never;

  beforeEach(() => usersService.findAll.mockClear());

  it('refuses includeDeleted to a guest', async () => {
    await expect(controller.findAll(jwt('GUEST'), 'true')).rejects.toThrow(
      ForbiddenException,
    );
    expect(usersService.findAll).not.toHaveBeenCalled();
  });

  it('always scopes a deleted listing to the caller', async () => {
    await controller.findAll(jwt('MANAGER'), 'true');

    expect(usersService.findAll).toHaveBeenCalledWith({
      includeDeleted: true,
      manageableBy: { id: 7, username: 'u', role: 'MANAGER' },
    });
  });

  it('leaves the plain listing untouched for other features', async () => {
    await controller.findAll(jwt('GUEST'));

    expect(usersService.findAll).toHaveBeenCalledWith({
      includeDeleted: false,
      manageableBy: undefined,
    });
  });
});
