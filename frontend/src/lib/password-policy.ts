/**
 * Password policy — must stay aligned with the backend
 * `IsStrongPasswordConstraint` (backend/src/common/validators).
 * Each rule may be satisfied anywhere in the password.
 */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
    key: 'length' | 'lowercase' | 'uppercase' | 'digit' | 'special';
    test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
    { key: 'length', test: (p) => p.length >= PASSWORD_MIN_LENGTH },
    { key: 'lowercase', test: (p) => /[a-z]/.test(p) },
    { key: 'uppercase', test: (p) => /[A-Z]/.test(p) },
    { key: 'digit', test: (p) => /[0-9]/.test(p) },
    { key: 'special', test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export function isStrongPassword(password: string): boolean {
    return PASSWORD_RULES.every((rule) => rule.test(password));
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const SPECIAL = '!@#$%^&*';
const ALL = LOWER + UPPER + DIGITS + SPECIAL;

/** Uniform integer in [0, max) from the Web Crypto API (rejection sampling, no modulo bias). */
function randomInt(max: number): number {
    const limit = Math.floor(0x100000000 / max) * max;
    const buffer = new Uint32Array(1);
    do {
        crypto.getRandomValues(buffer);
    } while (buffer[0] >= limit);
    return buffer[0] % max;
}

/**
 * Temporary password that always satisfies the policy above: one character of
 * each class, the rest drawn from all classes, then shuffled. Purely random
 * draws were refused by the server about one time in three.
 */
export function generateTemporaryPassword(length = PASSWORD_MIN_LENGTH): string {
    const size = Math.max(length, PASSWORD_MIN_LENGTH);
    const chars = [LOWER, UPPER, DIGITS, SPECIAL].map((set) => set[randomInt(set.length)]);
    while (chars.length < size) chars.push(ALL[randomInt(ALL.length)]);
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j], chars[i]];
    }
    return chars.join('');
}
