import { http } from './http';
import type {
    Task,
    CreateTaskDto,
    UpdateTaskDto,
    TaskAssignmentDto,
    Delegation,
    CreateDelegationDto,
    UpdateDelegationDto,
    PaginationParams,
    OverrideOccurrenceDto,
} from './types';

/**
 * Tasks API module.
 */
export const tasksApi = {
    /**
     * Get operational board items.
     */
    getBoard: (startDate: string, endDate: string, filterUserId?: number, filterGroupId?: number) => {
        const searchParams = new URLSearchParams();
        searchParams.set('start', startDate);
        searchParams.set('end', endDate);
        if (filterUserId !== undefined) searchParams.set('filterUserId', filterUserId.toString());
        if (filterGroupId !== undefined) searchParams.set('filterGroupId', filterGroupId.toString());
        return http.get<{ items: import('./types').BoardItem[]; total: number }>(`/tasks/board?${searchParams.toString()}`);
    },


    /**
     * Set task status (Validate/Fail).
     * date: ISO date string (YYYY-MM-DD), e.g. from BoardItem.instanceDate.
     */
    setStatus: (taskId: number, date: string, status: import('./types').TaskStatusValue, comment?: string) => {
        const body: { date: string; status: string; comment?: string } = {
            date: String(date).trim(),
            status: String(status),
        };
        if (comment !== undefined && comment !== '') body.comment = comment;
        return http.post<void>(`/tasks/${taskId}/status`, body);
    },

    /**
     * Get all tasks (paginated).
     */
    getAll: (params?: PaginationParams & { includeInactive?: boolean; filterUserId?: number; filterGroupId?: number }) => {
        const searchParams = new URLSearchParams();
        if (params?.page) searchParams.set('page', String(params.page));
        if (params?.limit) searchParams.set('limit', String(params.limit));
        if (params?.includeInactive) searchParams.set('includeInactive', 'true');
        if (params?.filterUserId) searchParams.set('filterUserId', String(params.filterUserId));
        if (params?.filterGroupId) searchParams.set('filterGroupId', String(params.filterGroupId));
        const query = searchParams.toString();
        return http.get<Task[]>(`/tasks${query ? `?${query}` : ''}`);
    },

    /**
     * Get archived tasks.
     */
    getArchivedTasks: () =>
        http.get<Task[]>('/tasks/archived'),

    /**
     * Soft delete a task.
     */
    deleteTask: (taskId: number) =>
        http.delete<{ message: string }>(`/tasks/${taskId}`),

    /**
     * Restore a soft-deleted task.
     */
    restoreTask: (taskId: number) =>
        http.post<{ message: string; task: Task }>(`/tasks/${taskId}/restore`),

    /**
     * Permanently delete a task.
     */
    permanentDeleteTask: (taskId: number) =>
        http.delete<{ message: string }>(`/tasks/${taskId}/permanent`),

    /**
     * Get task count.
     */
    count: () =>
        http.get<{ count: number }>('/tasks/count'),

    /**
     * Get task by ID.
     */
    getById: (id: number) =>
        http.get<Task>(`/tasks/${id}`),

    /**
     * Create new task.
     */
    create: (dto: CreateTaskDto) =>
        http.post<Task>('/tasks', dto),

    /**
     * Update task.
     */
    update: (id: number, dto: UpdateTaskDto) =>
        http.put<Task>(`/tasks/${id}`, dto),

    /**
     * Deactivate task.
     */
    deactivate: (id: number) =>
        http.patch<Task>(`/tasks/${id}/deactivate`),

    /**
     * Reactivate task.
     */
    reactivate: (id: number) =>
        http.patch<Task>(`/tasks/${id}/reactivate`),

    /**
     * Run task immediately.
     */
    run: (id: number) =>
        http.post<{ success: boolean; message: string; mode: string }>(`/tasks/${id}/run`),

    /**
     * Assign users to task.
     */
    assignUsers: (id: number, dto: TaskAssignmentDto) =>
        http.post<void>(`/tasks/${id}/users`, dto),

    /**
     * Unassign users from task.
     */
    unassignUsers: (id: number, dto: TaskAssignmentDto) =>
        http.delete<void>(`/tasks/${id}/users`, dto),

    /**
     * Assign groups to task.
     */
    assignGroups: (id: number, dto: TaskAssignmentDto) =>
        http.post<void>(`/tasks/${id}/groups`, dto),

    /**
     * Unassign groups from task.
     */
    unassignGroups: (id: number, dto: TaskAssignmentDto) =>
        http.delete<void>(`/tasks/${id}/groups`, dto),

    /**
     * Get task delegations.
     */
    getDelegations: (id: number) =>
        http.get<Delegation[]>(`/tasks/${id}/delegations`),

    /**
     * Create delegation.
     */
    createDelegation: (id: number, dto: CreateDelegationDto) =>
        http.post<Delegation>(`/tasks/${id}/delegations`, dto),

    /**
     * Update delegation.
     */
    updateDelegation: (taskId: number, delegationId: number, dto: UpdateDelegationDto) =>
        http.patch<Delegation>(`/tasks/${taskId}/delegations/${delegationId}`, dto),

    /**
     * Delete delegation.
     */
    deleteDelegation: (taskId: number, delegationId: number) =>
        http.delete<void>(`/tasks/${taskId}/delegations/${delegationId}`),

    /**
     * Set a task occurrence override (MOVE or SKIP).
     */
    overrideOccurrence: (taskId: number, dto: OverrideOccurrenceDto) =>
        http.post<void>(`/tasks/${taskId}/occurrences/override`, dto),

    /**
     * Delete a task occurrence override.
     */
    deleteOverride: (taskId: number, originalDate: string) =>
        http.delete<void>(`/tasks/${taskId}/occurrences/override?originalDate=${originalDate}`),

    /**
     * Upload procedure file.
     */
    uploadProcedure: (taskId: number, file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<{ procedureUrl: string }>(`/tasks/${taskId}/procedure`, formData);
    },

    /**
     * Download local procedure file.
     */
    downloadProcedure: (taskId: number) =>
        http.get<Blob>(`/tasks/${taskId}/procedure`, { responseType: 'blob' }),
};
