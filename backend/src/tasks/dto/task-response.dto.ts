/**
 * Task response DTO.
 */
export class TaskResponseDto {
  id!: number;
  name!: string; // Alias for description
  periodicity!: string;
  description!: string;
  procedureUrl!: string | null;
  startDate!: Date;
  endDate!: Date | null;
  activeUntil!: Date | null;
  skipWeekends!: boolean;
  skipHolidays!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
  deletedAt?: Date | null;
  deletedBy?: number | null;
  isActive!: boolean;
  assignedUserIds?: number[]; // Added for frontend convenience
  assignedGroupIds?: number[]; // Added for frontend convenience
  assignedUsers?: TaskAssigneeDto[];
  assignedGroups?: TaskGroupDto[];
  delegations?: TaskDelegationDto[];

  recurrenceMode?: string | null;
  rrule?: string | null;
  timezone?: string | null;
  dueOffset?: number | null;
}

export class TaskAssigneeDto {
  id!: number;
  username!: string;
  fullname!: string | null;
}

export class TaskGroupDto {
  id!: number;
  name!: string;
}

export class TaskDelegationDto {
  id!: number;
  startAt!: Date;
  endAt!: Date;
  targetUsers!: { id: number; username: string; fullname: string | null }[];
  targetGroups!: { id: number; name: string }[];
  delegatedBy?: {
    id: number;
    username: string;
    fullname: string | null;
  } | null;
}

/**
 * Maps a Prisma Task to TaskResponseDto.
 */
export function toTaskResponse(task: {
  id: number;
  name: string;
  periodicity: string;
  description: string;
  procedureUrl: string | null;
  startDate: Date;
  endDate: Date | null;
  activeUntil: Date | null;
  skipWeekends: boolean;
  skipHolidays: boolean;

  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  deletedBy?: number | null;
  recurrenceMode?: string | null;
  rrule?: string | null;
  timezone?: string | null;
  dueOffset?: number | null;

  userAssignments?: {
    user: { id: number; username: string; fullname: string | null };
  }[];
  groupAssignments?: { group: { id: number; name: string } }[];
  delegations?: {
    id: number;
    startAt: Date | null;
    endAt: Date | null;
    delegatedBy?: {
      id: number;
      username: string;
      fullname: string | null;
    } | null;
    targetUsers: {
      user: { id: number; username: string; fullname: string | null };
    }[];
    targetGroups: { group: { id: number; name: string } }[];
  }[];
}): TaskResponseDto {
  const now = new Date();
  const isActive = !task.activeUntil || task.activeUntil >= now;

  return {
    id: task.id,
    name: task.name,
    periodicity: task.periodicity,
    description: task.description,
    procedureUrl: task.procedureUrl,
    startDate: task.startDate,
    endDate: task.endDate,
    activeUntil: task.activeUntil,
    skipWeekends: task.skipWeekends,
    skipHolidays: task.skipHolidays,

    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    deletedAt: task.deletedAt,
    deletedBy: task.deletedBy,
    isActive,
    assignedUserIds: task.userAssignments?.map((a) => a.user.id) || [],
    assignedGroupIds: task.groupAssignments?.map((a) => a.group.id) || [],
    assignedUsers: task.userAssignments?.map((a) => ({
      id: a.user.id,
      username: a.user.username,
      fullname: a.user.fullname,
    })),
    assignedGroups: task.groupAssignments?.map((a) => ({
      id: a.group.id,
      name: a.group.name,
    })),
    delegations: task.delegations?.map((d) => ({
      id: d.id,
      startAt: d.startAt || new Date(0),
      endAt: d.endAt || new Date(2100, 0, 1),
      delegatedBy: d.delegatedBy
        ? {
            id: d.delegatedBy.id,
            username: d.delegatedBy.username,
            fullname: d.delegatedBy.fullname,
          }
        : null,
      targetUsers: d.targetUsers.map((tu) => ({
        id: tu.user.id,
        username: tu.user.username,
        fullname: tu.user.fullname,
      })),
      targetGroups: d.targetGroups.map((tg) => ({
        id: tg.group.id,
        name: tg.group.name,
      })),
    })),

    recurrenceMode: (task as any).recurrenceMode,
    rrule: (task as any).rrule,
    timezone: (task as any).timezone,
    dueOffset: (task as any).dueOffset,
  };
}
