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
