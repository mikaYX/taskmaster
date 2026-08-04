
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
   * Get application version status against the active official update source.
   * The backend selects GitHub releases or Docker Hub tags automatically.
   */
  getVersionStatus: () => http.get<VersionStatus>('/system/version'),

  /**
   * Force a fresh version lookup, bypassing the backend cache.
   */
  refreshVersionStatus: () => http.post<VersionStatus>('/system/version/refresh'),
};
