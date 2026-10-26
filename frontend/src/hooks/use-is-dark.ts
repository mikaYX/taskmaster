import { useEffect, useState } from 'react';

/** Whether the app currently renders in dark mode (the ThemeProvider toggles the `dark` class on <html>). */
export function useIsDark(): boolean {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

    useEffect(() => {
        const root = document.documentElement;
        const update = () => setIsDark(root.classList.contains('dark'));
        update();
        const observer = new MutationObserver(update);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return isDark;
}
