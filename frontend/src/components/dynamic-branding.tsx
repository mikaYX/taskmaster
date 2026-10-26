import { useEffect, useRef } from 'react';
import { usePublicBranding } from '@/hooks/use-public-branding';
import { accentForeground, isValidAccentColor } from '@/lib/accent-color';

const THEMES: Record<string, { primary: string; ring: string }> = {
    blue: { primary: 'hsl(199 89% 48%)', ring: 'hsl(199 89% 48%)' },
    green: { primary: 'hsl(158 84% 39%)', ring: 'hsl(158 84% 39%)' },
    purple: { primary: 'hsl(271 91% 65%)', ring: 'hsl(271 91% 65%)' },
    orange: { primary: 'hsl(24 95% 53%)', ring: 'hsl(24 95% 53%)' },
};

function readCache(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
}

function saveCache(key: string, value?: string) {
    try {
        if (value) localStorage.setItem(key, value);
        else localStorage.removeItem(key);
    } catch { /* Branding must work when browser storage is unavailable. */ }
}

export function DynamicBranding() {
    const { getSetting, isSuccess } = usePublicBranding();
    const faviconUrl = getSetting('app.faviconUrl');
    const appTitle = getSetting('app.title');
    const colorTheme = getSetting('ui.theme');
    const accentColor = getSetting('app.accentColor');
    const defaultFavicon = useRef(document.querySelector("link[rel~='icon']")?.getAttribute('href') || '/vite.svg');

    useEffect(() => {
        const url = (isSuccess ? faviconUrl : readCache('app.faviconUrl')) || defaultFavicon.current;
        let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = url;
        if (isSuccess) saveCache('app.faviconUrl', faviconUrl);
    }, [faviconUrl, isSuccess]);

    useEffect(() => {
        document.title = (isSuccess ? appTitle : readCache('app.title')) || 'Taskmaster';
        if (isSuccess) saveCache('app.title', appTitle);
    }, [appTitle, isSuccess]);

    useEffect(() => {
        const theme = (isSuccess ? colorTheme : readCache('ui.theme')) || 'default';
        const accent = isSuccess ? accentColor : readCache('app.accentColor');
        const colors = THEMES[theme];
        const root = document.documentElement;
        // A custom accent wins over the named theme colour.
        if (isValidAccentColor(accent)) {
            root.style.setProperty('--primary', accent);
            root.style.setProperty('--primary-foreground', accentForeground(accent));
            root.style.setProperty('--ring', accent);
            root.style.setProperty('--sidebar-primary', accent);
            root.style.setProperty('--sidebar-primary-foreground', accentForeground(accent));
        } else {
            root.style.removeProperty('--primary-foreground');
            root.style.removeProperty('--sidebar-primary');
            root.style.removeProperty('--sidebar-primary-foreground');
            if (colors) {
                root.style.setProperty('--primary', colors.primary);
                root.style.setProperty('--ring', colors.ring);
            } else {
                root.style.removeProperty('--primary');
                root.style.removeProperty('--ring');
            }
        }
        if (isSuccess) {
            saveCache('ui.theme', colorTheme);
            saveCache('app.accentColor', accentColor);
        }
    }, [colorTheme, accentColor, isSuccess]);

    return null;
}
