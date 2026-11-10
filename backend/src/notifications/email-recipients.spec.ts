import { isEmailReachable, resolveEmailRecipients } from './email-recipients';

describe('email recipients', () => {
  it('merges all sources, excludes deleted and emailless people and preserves the first spelling', async () => {
    const source = {
      user: {
        findMany: jest.fn().mockResolvedValue([
          { email: 'first@example.com', deletedAt: null },
          { email: 'deleted@example.com', deletedAt: new Date() },
          { email: null, deletedAt: null },
          { email: 'Admin@example.com', deletedAt: null },
        ]),
      },
      group: {
        findMany: jest.fn().mockResolvedValue([
          {
            members: [
              { user: { email: 'ADMIN@example.com', deletedAt: null } },
              { user: { email: 'member@example.com', deletedAt: null } },
              { user: { email: 'gone@example.com', deletedAt: new Date() } },
              { user: { email: '', deletedAt: null } },
            ],
          },
        ]),
      },
    };
    expect(
      await resolveEmailRecipients(source, {
        emails: ['First@Example.com', '', null],
        userIds: [42, 42, -1, 'bad', 1.5, Infinity],
        groupIds: [3, 0, 'bad'],
        includeSuperAdmins: true,
      }),
    ).toEqual(['First@Example.com', 'Admin@example.com', 'member@example.com']);
    expect(source.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ id: { in: [42] } }, { role: 'SUPER_ADMIN' }],
          deletedAt: null,
          email: { not: null },
        },
      }),
    );
    expect(source.group.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [3] } },
      }),
    );
  });

  it('does not query invalid or absent IDs', async () => {
    const source = {
      user: { findMany: jest.fn() },
      group: { findMany: jest.fn() },
    };
    expect(
      await resolveEmailRecipients(source, {
        userIds: ['1', NaN, 0],
        groupIds: [-1],
      }),
    ).toEqual([]);
    expect(source.user.findMany).not.toHaveBeenCalled();
    expect(source.group.findMany).not.toHaveBeenCalled();
  });

  it('keeps email eligibility separate from todo scope and preferences', () => {
    expect(
      isEmailReachable({ email: 'person@example.com', deletedAt: null }),
    ).toBe(true);
    expect(isEmailReachable({ email: '  ', deletedAt: null })).toBe(false);
    expect(isEmailReachable({ email: null, deletedAt: null })).toBe(false);
    expect(
      isEmailReachable({ email: 'person@example.com', deletedAt: new Date() }),
    ).toBe(false);
  });
});
