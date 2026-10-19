import { describe, expect, it } from 'vitest';
import { resolveAvatarSrc } from './avatar';

describe('resolveAvatarSrc', () => {
    it('returns undefined when the user has no avatar', () => {
        expect(resolveAvatarSrc(null)).toBeUndefined();
        expect(resolveAvatarSrc(undefined)).toBeUndefined();
        expect(resolveAvatarSrc('')).toBeUndefined();
    });

    it('keeps the same-origin path when no API base is configured', () => {
        expect(resolveAvatarSrc('/public/uploads/avatar-1-1.png', '')).toBe('/public/uploads/avatar-1-1.png');
    });

    it('drops the /api suffix of the API base', () => {
        expect(resolveAvatarSrc('/public/uploads/a.png', 'https://tasks.example.com/api')).toBe(
            'https://tasks.example.com/public/uploads/a.png',
        );
        expect(resolveAvatarSrc('/public/uploads/a.png', 'https://tasks.example.com/api/')).toBe(
            'https://tasks.example.com/public/uploads/a.png',
        );
    });

    it('leaves absolute URLs untouched', () => {
        expect(resolveAvatarSrc('https://cdn.example.com/a.png', '/api')).toBe('https://cdn.example.com/a.png');
    });
});
