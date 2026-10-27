import { afterEach, describe, expect, it, vi } from 'vitest';
import { declinePasskeyPrompt, isPasskeyPromptDeclined } from './passkey-prompt';

const store: Record<string, string> = {};

describe('passkey prompt refusal', () => {
    afterEach(() => {
        Object.keys(store).forEach((k) => delete store[k]);
        vi.unstubAllGlobals();
    });

    const stubStorage = () =>
        vi.stubGlobal('localStorage', {
            getItem: (k: string) => store[k] ?? null,
            setItem: (k: string, v: string) => { store[k] = v; },
        });

    it('remembers a refusal for that person only', () => {
        stubStorage();

        declinePasskeyPrompt(7);

        expect(isPasskeyPromptDeclined(7)).toBe(true);
        expect(isPasskeyPromptDeclined(8)).toBe(false);
    });

    it('asks again when nobody is signed in yet', () => {
        stubStorage();

        declinePasskeyPrompt(null);

        expect(isPasskeyPromptDeclined(null)).toBe(false);
        expect(Object.keys(store)).toHaveLength(0);
    });

    it('does not break when the storage is unavailable', () => {
        vi.stubGlobal('localStorage', {
            getItem: () => { throw new Error('blocked'); },
            setItem: () => { throw new Error('blocked'); },
        });

        expect(() => declinePasskeyPrompt(7)).not.toThrow();
        expect(isPasskeyPromptDeclined(7)).toBe(false);
    });
});
