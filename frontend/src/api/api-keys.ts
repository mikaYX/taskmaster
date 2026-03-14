import http from './http';
import type { ApiKey, CreateApiKeyResponse } from './types';

const BASE_URL = '/auth/api-keys';

export interface CreateApiKeyDto {
    name: string;
    description?: string;
    scopes: string[];
    expiresAt?: string;
}

export const apiKeys = {
    getAll: async (): Promise<ApiKey[]> => {
        const response = await http.get<ApiKey[]>(BASE_URL);
        return response;
    },

    create: async (dto: CreateApiKeyDto): Promise<CreateApiKeyResponse> => {
        const response = await http.post<CreateApiKeyResponse>(BASE_URL, dto);
        return response;
    },

    revoke: async (id: number): Promise<void> => {
        await http.delete(`${BASE_URL}/${id}`);
    },

    rotate: async (id: number): Promise<CreateApiKeyResponse> => {
        const response = await http.post<CreateApiKeyResponse>(`${BASE_URL}/${id}/rotate`, {});
        return response;
    }
};
