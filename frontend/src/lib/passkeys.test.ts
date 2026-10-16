import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPasskeyOrigin } from './passkeys';

afterEach(() => vi.unstubAllGlobals());

describe('passkey origin preflight', () => {
    it('accepts the configured domain and a parent RP domain', () => {
        vi.stubGlobal('window', { isSecureContext: true, location: { hostname: 'tasks.example.org', origin: 'https://tasks.example.org' } });
        expect(() => assertPasskeyOrigin('tasks.example.org')).not.toThrow();
        expect(() => assertPasskeyOrigin('example.org')).not.toThrow();
    });
    it('rejects a foreign domain without rewriting the RP ID', () => {
        vi.stubGlobal('window', { isSecureContext: true, location: { hostname: 'tasks.example.org', origin: 'https://tasks.example.org' } });
        expect(() => assertPasskeyOrigin('localhost')).toThrow();
        expect(() => assertPasskeyOrigin('other.example.org')).toThrow();
    });
    it('rejects an insecure browser context', () => {
        vi.stubGlobal('window', { isSecureContext: false, location: { hostname: 'tasks.example.org', origin: 'http://tasks.example.org' } });
        expect(() => assertPasskeyOrigin('tasks.example.org')).toThrow();
    });
});
