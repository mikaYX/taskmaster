import { http } from './http';
import type { AuditLogParams, PaginatedResponse, AuditLog } from './types';

/**
 * Audit API module.
 */
export const auditApi = {
    getLogs: (params: AuditLogParams) =>
        http.get<PaginatedResponse<AuditLog>>('/audit', { params: params as unknown as Record<string, string | number | boolean | undefined> }),
};
