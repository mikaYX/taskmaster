import { http } from './http';
import type { GenerateExportDto, ExportFile } from './types';

/**
 * Export API module.
 */
export const exportApi = {
    /**
     * Generate export (CSV or PDF).
     */
    generate: (dto: GenerateExportDto) =>
        http.post<{ filename: string }>('/backup/export', dto),

    /**
     * List all exports (uses backup list endpoint, exports have 'export_' prefix).
     */
    list: () =>
        http.get<ExportFile[]>('/backup/list'),

    /**
     * Get download URL for export.
     */
    getDownloadUrl: (filename: string) =>
        `/api/backup/download/${encodeURIComponent(filename)}`,

    /**
     * Test export generation.
     */
    test: () =>
        http.post<{ filename: string }>('/backup/export', { format: 'csv' }),

    /**
     * Test export email delivery.
     */
    testEmail: (recipients: string[]) =>
        http.post<void>('/backup/export/test-email', { recipients }),

    /**
     * Cleanup expired exports.
     */
    cleanup: () =>
        http.post<{ deleted: number }>('/backup/export/cleanup'),
};
