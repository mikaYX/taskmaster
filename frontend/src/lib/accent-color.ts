const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isValidAccentColor(value: string | null | undefined): value is string {
    return !!value && HEX_COLOR.test(value);
}

function channel(hex: string, start: number): number {
    const c = parseInt(hex.slice(start, start + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
    return 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
}

/** Text colour (near-white or near-black) with the best contrast on the accent. */
export function accentForeground(hex: string): string {
    const lum = relativeLuminance(hex);
    const contrastWithWhite = 1.05 / (lum + 0.05);
    const contrastWithBlack = (lum + 0.05) / 0.05;
    return contrastWithWhite >= contrastWithBlack ? '#f8fafc' : '#0f172a';
}

/** Contrast ratio of the best text colour on the accent (4.5+ is comfortable for body text). */
export function accentContrastRatio(hex: string): number {
    const lum = relativeLuminance(hex);
    return Math.max(1.05 / (lum + 0.05), (lum + 0.05) / 0.05);
}
