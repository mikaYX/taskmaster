import { http } from './http';

export interface Site {
    id: number;
    name: string;
    code: string;
    description: string | null;
    parentId: number | null;
    isActive: boolean;
    parent?: { id: number; name: string; code: string } | null;
    children?: { id: number; name: string; code: string }[];
    _count?: {
        users: number;
        tasks: number;
        groups: number;
    };
    createdAt: string;
    updatedAt: string;
}

export interface CreateSiteDto {
    name: string;
    code: string;
    description?: string;
    parentId?: number;
}

export interface UpdateSiteDto {
    name?: string;
    code?: string;
    description?: string;
    parentId?: number;
}

export interface SiteUser {
    id: number;
    username: string;
    fullname: string | null;
    email: string | null;
    role: string;
    isDefault: boolean;
    assignedAt: string;
}

export const sitesApi = {
    findAll: () => http.get<Site[]>('/sites'),

    findOne: (id: number) => http.get<Site>(`/sites/${id}`),

    create: (dto: CreateSiteDto) => http.post<Site>('/sites', dto),

    update: (id: number, dto: UpdateSiteDto) => http.put<Site>(`/sites/${id}`, dto),

    delete: (id: number) => http.delete<void>(`/sites/${id}`),

    getSiteUsers: (siteId: number) =>
        http.get<SiteUser[]>(`/sites/${siteId}/users`),

    assignUser: (siteId: number, userId: number, isDefault?: boolean) =>
        http.post(`/sites/${siteId}/users/${userId}`, { isDefault }),

    removeUser: (siteId: number, userId: number) =>
        http.delete(`/sites/${siteId}/users/${userId}`),
};
