export class GroupResponseDto {
  id!: number;
  name!: string;
  isSystem!: boolean;
  description?: string | null;
  createdAt!: Date;
  updatedAt!: Date;
  memberCount?: number;
  members?: GroupMemberDto[];
  siteId!: number;
  site?: { id: number; name: string; code: string };
}

export class GroupMemberDto {
  id!: number;
  username!: string;
  fullname!: string | null;
}

export function toGroupResponse(group: {
  id: number;
  name: string;
  isSystem: boolean;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  siteId: number;
  site?: { id: number; name: string; code: string };
  members?: {
    user: { id: number; username: string; fullname: string | null };
  }[];
  _count?: { members: number };
}): GroupResponseDto {
  return {
    id: group.id,
    name: group.name,
    isSystem: group.isSystem,
    description: group.description,
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
    memberCount: group._count?.members,
    siteId: group.siteId,
    site: group.site
      ? { id: group.site.id, name: group.site.name, code: group.site.code }
      : undefined,
    members: group.members?.map((m) => ({
      id: m.user.id,
      username: m.user.username,
      fullname: m.user.fullname,
    })),
  };
}
