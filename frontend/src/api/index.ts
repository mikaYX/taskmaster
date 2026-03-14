/**
 * API Client - Barrel Export.
 * 
 * Centralized export for all API modules.
 */

// HTTP Client
export { http, ApiError } from './http';

// Types
export * from './types';

// API Modules
export { authApi } from './auth';
export { usersApi } from './users';
export { groupsApi } from './groups';
export { tasksApi } from './tasks';
export { statusApi } from './status';
export { settingsApi } from './settings';

export { exportApi } from './export';
export { backupApi } from './backup';
export { jobsApi } from './jobs';
export { setupApi } from './setup';
export { auditApi } from './audit';
export { sitesApi } from './sites';
export { notificationsApi } from './notifications';
