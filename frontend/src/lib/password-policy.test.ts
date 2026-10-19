import { describe, expect, it } from 'vitest';
import { PASSWORD_MIN_LENGTH, generateTemporaryPassword, isStrongPassword } from './password-policy';

describe('generateTemporaryPassword', () => {
    it('always satisfies the password policy the server enforces', () => {
        // The previous purely random generator failed roughly 37% of the time.
        for (let i = 0; i < 5000; i++) {
            const password = generateTemporaryPassword();
            expect(password).toHaveLength(PASSWORD_MIN_LENGTH);
            expect(isStrongPassword(password)).toBe(true);
        }
    });

    it('never goes below the minimum length', () => {
        expect(generateTemporaryPassword(4)).toHaveLength(PASSWORD_MIN_LENGTH);
        expect(generateTemporaryPassword(20)).toHaveLength(20);
    });

    it('produces different values', () => {
        const values = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()));
        expect(values.size).toBe(50);
    });

    it('does not rely on characters that break copy-paste or quoting', () => {
        for (let i = 0; i < 500; i++) {
            expect(generateTemporaryPassword()).not.toMatch(/[\s"'`\\<>]/);
        }
    });
});
