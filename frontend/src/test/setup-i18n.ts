/**
 * Initialises i18next (English) for every test, so components that call useTranslation
 * render real texts instead of keys. Tests that mock react-i18next are unaffected, and a
 * test can switch language with i18n.changeLanguage('fr').
 */
import i18n from '@/lib/i18n';

await i18n.changeLanguage('en');
