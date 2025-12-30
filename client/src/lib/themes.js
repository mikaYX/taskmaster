// Available themes for the application
export const THEMES = {
    blue: {
        name: 'blue',
        label: { EN: 'Blue', FR: 'Bleu' },
        class: '' // default, no class needed
    },
    violet: {
        name: 'violet',
        label: { EN: 'Violet', FR: 'Violet' },
        class: 'theme-violet'
    },
    green: {
        name: 'green',
        label: { EN: 'Green', FR: 'Vert' },
        class: 'theme-green'
    },
    orange: {
        name: 'orange',
        label: { EN: 'Orange', FR: 'Orange' },
        class: 'theme-orange'
    },
    red: {
        name: 'red',
        label: { EN: 'Red', FR: 'Rouge' },
        class: 'theme-red'
    },
    slate: {
        name: 'slate',
        label: { EN: 'Slate', FR: 'Ardoise' },
        class: 'theme-slate'
    }
};

export function applyTheme(themeName) {
    const theme = THEMES[themeName] || THEMES.blue;
    const root = document.documentElement;

    // Remove all theme classes
    Object.values(THEMES).forEach(t => {
        if (t.class) root.classList.remove(t.class);
    });

    // Apply new theme class
    if (theme.class) {
        root.classList.add(theme.class);
    }
}
