import { http } from './http';
import type {
    LoginDto,
    LoginResponse,
    AuthSessionResponse,
    Session,
    ChangePasswordDto,
    VerifyMfaLoginDto,
    MfaSetupResponse,
    MfaEnableResponse,
    Passkey,
} from './types';

/**
 * Auth API module.
 */
export const authApi = {
    /**
     * Login with username and password.
     */
    login: (dto: LoginDto) =>
        http.post<LoginResponse>('/auth/login', dto),

    /**
     * Verify MFA and complete login.
     */
    verifyMfa: (dto: VerifyMfaLoginDto) =>
        http.post<AuthSessionResponse>('/auth/mfa/verify', dto),

    mfaGenerate: () =>
        http.post<MfaSetupResponse>('/auth/mfa/generate'),

    mfaEnable: (token: string) =>
        http.post<MfaEnableResponse>('/auth/mfa/enable', { token }),

    mfaDisable: () =>
        http.post<{ message: string }>('/auth/mfa/disable'),

    /**
     * Get current session.
     */
    getSession: () =>
        http.get<Session>('/auth/session'),

    /**
     * Refresh tokens.
     */
    refresh: () =>
        http.post<AuthSessionResponse>('/auth/refresh'),

    /**
     * Change password.
     */
    changePassword: (dto: ChangePasswordDto) =>
        http.post<{ ok: boolean }>('/auth/password', dto),

    /**
     * Logout (revokes all refresh tokens).
     */
    logout: () =>
        http.post<{ ok: boolean }>('/auth/logout'),

    // Passkeys
    listPasskeys: () =>
        http.get<Passkey[]>('/auth/passkeys'),
    deletePasskey: (id: string) =>
        http.delete<{ success: boolean }>(`/auth/passkeys/${id}`),
    generatePasskeyRegistrationOptions: () =>
        http.get<any>('/auth/passkeys/register/options'),
    verifyPasskeyRegistration: (payload: { response: any, name?: string }) =>
        http.post<{ verified: boolean }>('/auth/passkeys/register/verify', payload),
    generatePasskeyAuthenticationOptions: () =>
        http.get<{ options: any, sessionId: string }>('/auth/passkeys/login/options'),
    verifyPasskeyAuthentication: (response: any, sessionId: string) =>
        http.post<AuthSessionResponse>('/auth/passkeys/login/verify', { response, sessionId }),

    exchangeSsoTicket: (ssoTicket: string) =>
        http.post<AuthSessionResponse>('/auth/external/exchange', { ssoTicket }),
};
