import { Prisma, UserRole } from '@prisma/client';

interface Person {
  email: string | null;
  deletedAt: Date | null;
}

export function isEmailReachable(
  person: Person,
): person is Person & { email: string } {
  return (
    person.deletedAt === null &&
    typeof person.email === 'string' &&
    person.email.trim().length > 0
  );
}

const personSelect = { email: true, deletedAt: true } as const;

interface RecipientSource {
  user: {
    findMany(args: {
      where: Prisma.UserWhereInput;
      select: typeof personSelect;
    }): Promise<Person[]>;
  };
  group: {
    findMany(args: {
      where: Prisma.GroupWhereInput;
      include: {
        members: { include: { user: { select: typeof personSelect } } };
      };
    }): Promise<{ members: { user: Person }[] }[]>;
  };
}

function validIds(values: readonly unknown[] = []): number[] {
  return [
    ...new Set(
      values.filter(
        (id): id is number =>
          typeof id === 'number' && Number.isSafeInteger(id) && id > 0,
      ),
    ),
  ];
}

export async function resolveEmailRecipients(
  source: RecipientSource,
  options: {
    emails?: readonly unknown[];
    userIds?: readonly unknown[];
    groupIds?: readonly unknown[];
    includeSuperAdmins?: boolean;
  },
): Promise<string[]> {
  const recipients = new Map<string, string>();
  const add = (email: unknown) => {
    if (typeof email !== 'string' || !email.trim()) return;
    const normalized = email.trim().toLowerCase();
    if (!recipients.has(normalized)) recipients.set(normalized, email);
  };
  options.emails?.forEach(add);
  const userIds = validIds(options.userIds);
  if (userIds.length || options.includeSuperAdmins) {
    const users = await source.user.findMany({
      where: {
        OR: [
          { id: { in: userIds } },
          ...(options.includeSuperAdmins
            ? [{ role: UserRole.SUPER_ADMIN }]
            : []),
        ],
        deletedAt: null,
        email: { not: null },
      },
      select: personSelect,
    });
    users.filter(isEmailReachable).forEach((person) => add(person.email));
  }
  const groupIds = validIds(options.groupIds);
  if (groupIds.length) {
    const groups = await source.group.findMany({
      where: { id: { in: groupIds } },
      include: { members: { include: { user: { select: personSelect } } } },
    });
    for (const group of groups) {
      group.members
        .map((member) => member.user)
        .filter(isEmailReachable)
        .forEach((person) => add(person.email));
    }
  }
  return [...recipients.values()];
}
