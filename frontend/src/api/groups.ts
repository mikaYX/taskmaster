import { http } from './http';
import type {
    Group,
    CreateGroupDto,
    UpdateGroupDto,
    GroupMembersDto,
    User,
    PaginationParams,
} from './types';

/**
 * Groups API module.
 */
export const groupsApi = {
    /**
     * Get all groups (paginated).
     */
    getAll: (params?: PaginationParams) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));
        const query = searchParams.toString();
        return http.get<Group[]>(`/groups${query ? `?${query}` : ''}`);
    },

    /**
     * Get group count.
     */
    count: () =>
        http.get<{ count: number }>('/groups/count'),

    /**
     * Get group by ID.
     */
    getById: (id: number) =>
        http.get<Group>(`/groups/${id}`),

    /**
     * Create new group.
     */
    create: (dto: CreateGroupDto) =>
        http.post<Group>('/groups', dto),

    /**
     * Update group.
     */
    update: (id: number, dto: UpdateGroupDto) =>
        http.put<Group>(`/groups/${id}`, dto),

    /**
     * Delete group.
     */
    delete: (id: number) =>
        http.delete<void>(`/groups/${id}`),

    /**
     * Get group members.
     */
    getMembers: (id: number) =>
        http.get<(User & { isLead?: boolean })[]>(`/groups/${id}/members`),

    /**
     * Make a member a lead of the team, or take that back (a group can have several).
     */
    setLead: (id: number, userId: number, isLead: boolean) =>
        http.put<void>(`/groups/${id}/members/${userId}/lead`, { isLead }),

    /**
     * Add members to group.
     */
    addMembers: (id: number, dto: GroupMembersDto) =>
        http.post<void>(`/groups/${id}/members`, dto),

    /**
     * Remove members from group.
     */
    removeMembers: (id: number, dto: GroupMembersDto) =>
        http.delete<void>(`/groups/${id}/members`, dto),
};
