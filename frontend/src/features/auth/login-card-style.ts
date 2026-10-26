import type { CSSProperties } from 'react';

export const LOGIN_CARD_OPACITY_MIN = 40;
export const LOGIN_CARD_OPACITY_MAX = 100;

/** Parses the stored setting; anything invalid falls back to a fully opaque card. */
export function parseLoginCardOpacity(value: string | undefined): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return LOGIN_CARD_OPACITY_MAX;
    return Math.min(LOGIN_CARD_OPACITY_MAX, Math.max(LOGIN_CARD_OPACITY_MIN, Math.round(parsed)));
}

/**
 * Frosted-glass card: translucent theme background plus a backdrop blur, so the
 * form stays readable on busy wallpapers. Fully opaque keeps the plain card.
 */
export function loginCardStyle(opacity: number): CSSProperties | undefined {
    if (opacity >= LOGIN_CARD_OPACITY_MAX) return undefined;
    return {
        backgroundColor: `color-mix(in srgb, var(--card) ${opacity}%, transparent)`,
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
    };
}

export const WALLPAPER_BLUR_MAX = 20;
export const WALLPAPER_DIM_MAX = 80;

function parseBounded(value: string | undefined, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.min(max, Math.max(0, Math.round(parsed)));
}

export const parseWallpaperBlur = (value: string | undefined) => parseBounded(value, WALLPAPER_BLUR_MAX);
export const parseWallpaperDim = (value: string | undefined) => parseBounded(value, WALLPAPER_DIM_MAX);

/** Wallpaper layer: blurred copy of the image, scaled up so the blur does not leave transparent edges. */
export function wallpaperLayerStyle(url: string, blur: number): CSSProperties {
    return {
        backgroundImage: `url("${url}")`,
        filter: blur > 0 ? `blur(${blur}px)` : undefined,
        transform: blur > 0 ? 'scale(1.08)' : undefined,
    };
}

/** Logo for the current colour mode: the dark variant when there is one, the main logo otherwise. */
export function pickLogo(isDark: boolean, logo: string | undefined, logoDark: string | undefined): string | undefined {
    return isDark && logoDark ? logoDark : logo;
}
