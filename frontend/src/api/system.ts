
import { http } from './http';

export interface SystemHealth {
  status: 'ok' | 'error' | 'maintenance';
  db: 'up' | 'down';
  version?: string;
}

export interface VersionStatus {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  repo: string;
  releaseUrl: string | null;
  checkedAt: string;
  sourceStatus: 'ok' | 'degraded';
  error: string | null;
}

export const systemApi = {
  /**
   * Check system health status.
   * Expects backend to return { status: 'ok', db: 'up' } or 5xx error.
   */
  checkHealth: () => http.get<SystemHealth>('/health'),

  /**
   * Get application version status (current vs latest on GitHub).
   */
  getVersionStatus: () => http.get<VersionStatus>('/system/version'),
};
