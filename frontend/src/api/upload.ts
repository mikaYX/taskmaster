import { http } from './http';

export interface UploadResponse {
    url: string;
    filename: string;
    mimetype: string;
    size: number;
}

export const uploadApi = {
    /**
     * Upload a file (image, etc.)
     */
    uploadFile: async (file: File): Promise<UploadResponse> => {
        const formData = new FormData();
        formData.append('file', file);
        return http.post<UploadResponse>('/upload', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
    },
};
