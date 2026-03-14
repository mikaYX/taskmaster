import { http } from './http';

export interface SetupStatus {
    needsSetup: boolean;
}

export interface InitializeAdminRequest {
    username: string;
    password: string;
    /** Initial preference: enable Todo list (default true). */
    addonsTodolistEnabled?: boolean;
}

export interface InitializeAdminResponse {
    success: boolean;
    message: string;
}

/**
 * Setup API module.
 */
export const setupApi = {
    /**
     * Check if initial setup is needed.
     */
    getStatus: () =>
        http.get<SetupStatus>('/setup/status'),

    /**
     * Initialize the first admin user.
     */
    initialize: (data: InitializeAdminRequest) =>
        http.post<InitializeAdminResponse>('/setup/initialize', data),
};
