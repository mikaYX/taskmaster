/**
 * Tests d'accessibilité — ErrorFallback (point 100)
 * Vérifie que les composants d'erreur respectent WCAG 2.1 AA.
 */

import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { axe } from '../setup-a11y';
import { ErrorFallback } from '@/components/error-boundary/error-fallback';
import { MemoryRouter } from 'react-router-dom';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts?.context ? `${key} (${opts.context})` : key,
  }),
}));

// useNavigate doit fonctionner dans MemoryRouter
const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('Point 100 — Accessibilité ErrorFallback', () => {
  const mockError = new Error('Test error message');
  const mockReset = vi.fn();

  it('variant page : aucune violation axe WCAG', async () => {
    const { container } = render(
      <ErrorFallback error={mockError} resetError={mockReset} variant="page" />,
      { wrapper: Wrapper },
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('variant section : aucune violation axe WCAG', async () => {
    const { container } = render(
      <ErrorFallback
        error={mockError}
        resetError={mockReset}
        variant="section"
        context="Tableau de bord"
      />,
      { wrapper: Wrapper },
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
