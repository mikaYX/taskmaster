import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from '@/locales/en.json';
import fr from '@/locales/fr.json';

/**
 * i18n Configuration.
 * 
 * - Browser language detection
 * - Fallback to English
 * - FR + EN support
 */
i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            fr: { translation: fr },
        },
        fallbackLng: 'en',
        supportedLngs: ['en', 'fr'],
        interpolation: {
            escapeValue: false, // React already escapes
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: 'taskmaster-language',
        },
    });

export default i18n;

/**
 * Change language programmatically.
 */
export function setLanguage(lang: 'en' | 'fr') {
    i18n.changeLanguage(lang);
}

/**
 * Get current language.
 */
export function getCurrentLanguage(): string {
    return i18n.language;
}

/**
 * Available languages.
 */
export const LANGUAGES = [
    { code: 'en', name: 'English' },
    { code: 'fr', name: 'Français' },
] as const;
