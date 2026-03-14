import { useEffect } from 'react';
import { useSettings } from '@/features/settings/hooks/use-settings';

export function DynamicBranding() {
    const { getSetting } = useSettings();
    const faviconUrl = getSetting('app.faviconUrl');
    const appTitle = getSetting('app.title');
    const colorTheme = getSetting('ui.theme');

    // Theme HSL definitions
    const THEMES: Record<string, { primary: string; ring: string }> = {
        // 'default' uses index.css values (Legacy Blue)
        // 'blue' -> Sky 500
        blue: { primary: 'hsl(199 89% 48%)', ring: 'hsl(199 89% 48%)' },
        // 'green' -> Emerald 500
        green: { primary: 'hsl(158 84% 39%)', ring: 'hsl(158 84% 39%)' },
        // 'purple' -> Purple 500
        purple: { primary: 'hsl(271 91% 65%)', ring: 'hsl(271 91% 65%)' },
        // 'orange' -> Orange 500
        orange: { primary: 'hsl(24 95% 53%)', ring: 'hsl(24 95% 53%)' },
    };

    useEffect(() => {
        // Try to load from localStorage first to prevent flash
        const cachedFavicon = localStorage.getItem('app.faviconUrl');
        const urlToUse = faviconUrl || cachedFavicon;

        if (urlToUse) {
            // Find existing favicon or create new ones
            let link: HTMLLinkElement | null = document.querySelector("link[rel~='icon']");
            if (!link) {
                link = document.createElement('link');
                link.rel = 'icon';
                document.head.appendChild(link);
            }
            link.href = urlToUse;
        }

        if (faviconUrl) {
            localStorage.setItem('app.faviconUrl', faviconUrl);
        }
    }, [faviconUrl]);

    useEffect(() => {
        // Try to load from localStorage first
        const cachedTitle = localStorage.getItem('app.title');

        if (appTitle) {
            document.title = appTitle;
            localStorage.setItem('app.title', appTitle);
        } else if (cachedTitle) {
            document.title = cachedTitle;
        }
    }, [appTitle]);

    useEffect(() => {
        // 1. Get theme to use (Settings > Cache > Default)
        const cachedTheme = localStorage.getItem('ui.theme');
        const themeToUse = colorTheme || cachedTheme || 'default';

        // 2. Apply theme
        const root = document.documentElement;
        if (themeToUse !== 'default' && THEMES[themeToUse]) {
            const themeColors = THEMES[themeToUse];
            root.style.setProperty('--primary', themeColors.primary);
            root.style.setProperty('--ring', themeColors.ring);
            // Also update charts if needed, but primary is most important
        } else {
            // Revert to CSS defaults
            root.style.removeProperty('--primary');
            root.style.removeProperty('--ring');
        }

        // 3. Update cache if we have a fresh value from settings
        if (colorTheme) {
            localStorage.setItem('ui.theme', colorTheme);
        }
    }, [colorTheme]);

    return null;
}
