import i18next from 'i18next';
import { getErrorMessage } from '@/api/http';

export function assertPasskeyOrigin(rpID?: string) {
    const host = window.location.hostname;
    if (window.isSecureContext === false || (rpID && host !== rpID && !host.endsWith(`.${rpID}`))) {
        throw new Error(i18next.t('auth.passkeyOriginError', {
            origin: window.location.origin,
            rpID: rpID || host,
        }));
    }
}

export function passkeyErrorMessage(error: unknown, fallback: string) {
    const message = getErrorMessage(error, fallback);
    if (/Passkey configuration invalid|rp\.id|relying party|RP ID/i.test(message)) {
        return i18next.t('auth.passkeyConfigError');
    }
    return message;
}
