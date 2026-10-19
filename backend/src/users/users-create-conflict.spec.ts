import { ConflictException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.create - username conflicts', () => {
  const findUnique = jest.fn();
  const prisma = { client: { user: { findUnique } } };
  const service = new UsersService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );
  const dto = {
    username: 'jane@example.com',
    email: 'jane@example.com',
    password: 'Str0ng!Passw0rd',
  };

  beforeEach(() => jest.resetAllMocks());

  it('reports an active account with the same username', async () => {
    findUnique.mockResolvedValue({ id: 3, deletedAt: null });

    await expect(service.create(dto)).rejects.toThrow(
      'Username "jane@example.com" already exists',
    );
  });

  it('tells the admin to restore a soft-deleted account instead of a bare conflict', async () => {
    findUnique.mockResolvedValue({ id: 3, deletedAt: new Date() });

    const attempt = service.create(dto);
    await expect(attempt).rejects.toBeInstanceOf(ConflictException);
    await expect(attempt).rejects.toThrow(/deleted account.*Restore it/);
  });
});
