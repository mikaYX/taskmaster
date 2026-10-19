/**
 * Avatar URLs are stored as `/public/uploads/<file>`, a path served outside
 * `/api`, so the `/api` suffix of VITE_API_URL (when set) must not be kept.
 */
export function resolveAvatarSrc(
    avatarUrl: string | null | undefined,
    apiUrl: string = import.meta.env.VITE_API_URL ?? '',
): string | undefined {
    if (!avatarUrl) return undefined;
    if (/^(https?:)?\/\//i.test(avatarUrl)) return avatarUrl;
    return `${apiUrl.replace(/\/api\/?$/, '')}${avatarUrl}`;
}
