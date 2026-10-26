import { describe, expect, it } from 'vitest';
import { accentContrastRatio, accentForeground, isValidAccentColor } from './accent-color';

describe('accent colour helpers', () => {
    it('accepts only #rrggbb', () => {
        expect(isValidAccentColor('#3b82f6')).toBe(true);
        expect(isValidAccentColor('#FFF')).toBe(false);
        expect(isValidAccentColor('3b82f6')).toBe(false);
        expect(isValidAccentColor('')).toBe(false);
        expect(isValidAccentColor(null)).toBe(false);
    });

    it('picks readable text for dark and light accents', () => {
        expect(accentForeground('#0f172a')).toBe('#f8fafc');
        expect(accentForeground('#fde047')).toBe('#0f172a');
    });

    it('flags mid-tone colours as low contrast', () => {
        expect(accentContrastRatio('#000000')).toBeGreaterThan(15);
        expect(accentContrastRatio('#808080')).toBeLessThan(5.5);
    });
});
