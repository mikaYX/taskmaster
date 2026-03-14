/**
 * Setup des matchers axe pour Vitest.
 * Importé via vite.config.ts → test.setupFiles.
 */
import { configureAxe, toHaveNoViolations } from 'jest-axe';
import { expect } from 'vitest';

// Enregistre le matcher toHaveNoViolations dans Vitest
expect.extend(toHaveNoViolations);

// Configuration globale axe (règles à appliquer)
export const axe = configureAxe({
  rules: {
    // Désactive les règles nécessitant un contexte document complet
    // (page-level) non applicable dans les tests unitaires de composants
    region: { enabled: false },
  },
});
