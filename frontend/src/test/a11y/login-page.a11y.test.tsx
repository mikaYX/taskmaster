/**
 * Tests d'accessibilité — LoginPage (point 100)
 * Page critique : première interaction utilisateur.
 */

import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { axe } from '../setup-a11y';
import { LoginPage } from '@/features/auth/login-page';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    verifyMfa: vi.fn(),
    generatePasskeyAuthenticationOptions: vi.fn(),
    verifyPasskeyAuthentication: vi.fn(),
    getSession: vi.fn().mockResolvedValue({ id: 1, role: 'USER', valid: true }),
    exchangeSsoTicket: vi.fn(),
  },
}));
vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
}));
vi.mock('@/api/settings', () => ({
  settingsApi: {
    getPublicBranding: vi.fn().mockResolvedValue({
      'app.title': 'Taskmaster',
      'auth.passkeys.enabled': 'false',
    }),
  },
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const mockStorage: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: vi.fn((k: string) => mockStorage[k] ?? null),
  setItem: vi.fn((k: string, v: string) => { mockStorage[k] = v; }),
  removeItem: vi.fn((k: string) => { delete mockStorage[k]; }),
  clear: vi.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); }),
});

describe('Point 100 — Accessibilité LoginPage', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  });

  it('aucune violation axe WCAG sur la page de login', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/login']}>
        <QueryClientProvider client={queryClient}>
          <LoginPage />
        </QueryClientProvider>
      </MemoryRouter>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
