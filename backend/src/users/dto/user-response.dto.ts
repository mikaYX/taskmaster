import { UserRole } from '@prisma/client';

/**
 * User response DTO - excludes sensitive data.
 * Never exposes: passwordHash, deletedAt, authProvider details
 */
export class UserResponseDto {
  id!: number;
  username!: string;
  fullname!: string | null;
  avatarUrl!: string | null;
  email!: string | null;
  role!: UserRole;
  mustChangePassword!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
  groups?: string[];
}

/**
 * Maps a Prisma User to UserResponseDto.
 * Explicitly excludes sensitive fields.
 */
export function toUserResponse(user: {
  id: number;
  username: string;
  fullname: string | null;
  avatarUrl?: string | null;
  email: string | null;
  role: UserRole;
  mustChangePassword: boolean;
  createdAt: Date;
  updatedAt: Date;
  groupMemberships?: { group: { name: string } }[];
}): UserResponseDto {
  return {
    id: user.id,
    username: user.username,
    fullname: user.fullname,
    avatarUrl: user.avatarUrl ?? null,
    email: user.email,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    groups: user.groupMemberships?.map((m) => m.group.name),
  };
}
