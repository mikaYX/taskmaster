import { http } from './http';

export interface BackupFile {
    filename: string;
    size: number;
    createdAt: string;
}

export const backupApi = {
    /**
     * List available backups.
     */
    list: () =>
        http.get<BackupFile[]>('/backup/list'),

    /**
     * Get backup module status (encryption, time).
     */
    getStatus: () =>
        http.get<{ encryptionKeyPresent: boolean; encryptionKeyIsDefault: boolean; serverTime: string; timezone: string }>('/backup/status'),

    /**
     * Get download URL for a backup.
     */
    getDownloadUrl: (filename: string) =>
        `/api/backup/download/${encodeURIComponent(filename)}`,

    /**
     * Download a backup file (authenticated).
     */
    download: async (filename: string) => {
        const response = await http.get<Blob>(`/backup/download/${encodeURIComponent(filename)}`, {
            responseType: 'blob',
        });
        // Axios/Http client returns data directly if interceptor extracts it, 
        // but for blob responseType we might get the blob.
        // Let's assume http.get returns the data.
        return response;
    },

    /**
     * Import a backup file (save to history).
     */
    import: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<{ status: string; filename: string; size: number }>('/backup/import', formData);
    },

    /**
     * Restore from a backup file.
     */
    /**
     * Validate a server-side backup (pre-flight).
     */
    validate: (filename: string) =>
        http.get<{
            isValid: boolean;
            needsDecryptionKey: boolean;
            manifest?: any;
            error?: string;
            details?: string;
        }>(`/backup/validate/${filename}`),

    /**
     * Validate an external backup file (pre-flight check).
     * Uploads the file to a temp location and returns validation result + temp filename.
     */
    validateExternal: (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<{
            isValid: boolean;
            needsDecryptionKey: boolean;
            manifest?: any;
            error?: string;
            details?: string;
            tempFilename?: string;
        }>('/backup/validate-ext', formData);
    },

    /**
     * Restore from a backup file (upload) or server filename.
     */
    restore: (fileOrFilename: File | string, decryptionKey?: string, force?: boolean) => {
        if (fileOrFilename instanceof File) {
            const formData = new FormData();
            formData.append('file', fileOrFilename);
            if (decryptionKey) formData.append('decryptionKey', decryptionKey);
            if (force) formData.append('force', 'true');
            return http.post<void>('/backup/restore', formData);
        } else {
            // Restore from server file
            return http.post<void>('/backup/restore', {
                filename: fileOrFilename,
                decryptionKey,
                force: force ? 'true' : 'false'
            });
        }
    },

    /**
     * Trigger a system snapshot (Full or DB).
     */
    createSystem: (type: 'DB' | 'FULL' = 'FULL') =>
        http.post<{ filename: string }>('/backup/system', { type }),

    /**
     * Trigger a business data export.
     */
    exportData: (format: 'json' | 'csv') =>
        http.post<{ filename: string; path: string }>('/backup/export', { format }),

    /**
     * Delete a backup
     */
    delete: (filename: string) =>
        http.delete(`/backup/${filename}`),

    // Deprecated alias for legacy calls if any
    create: () => http.post<{ filename: string }>('/backup/system', { type: 'FULL' }),
};
