// @vitest-environment jsdom
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VersionUpdateBanner } from './version-update-banner';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts) return `${key}:${JSON.stringify(opts)}`;
      return key;
    },
  }),
}));

const mockVersionData = {
  data: null as ReturnType<
    typeof import('@/hooks/use-version-status').useVersionStatus
  >['data'],
  isLoading: false,
  backendUpgraded: false,
};

vi.mock('@/hooks/use-version-status', () => ({
  useVersionStatus: () => mockVersionData,
}));

const mockAuthState = { role: 'SUPER_ADMIN' as string | null };

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (s: { role: string | null }) => unknown) =>
    selector(mockAuthState),
}));

const mockSessionStorage: Record<string, string> = {};

describe('VersionUpdateBanner', () => {
  beforeEach(() => {
    mockVersionData.data = null;
    mockVersionData.isLoading = false;
    mockVersionData.backendUpgraded = false;
    mockAuthState.role = 'SUPER_ADMIN';
    for (const k in mockSessionStorage) delete mockSessionStorage[k];

    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn((key: string) => mockSessionStorage[key] ?? null),
      setItem: vi.fn((key: string, val: string) => {
        mockSessionStorage[key] = val;
      }),
      removeItem: vi.fn((key: string) => {
        delete mockSessionStorage[key];
      }),
    });
  });

  it('should render nothing when no data', () => {
    const { container } = render(<VersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing for non-privileged roles', () => {
    mockAuthState.role = 'USER';
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const { container } = render(<VersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render nothing for GUEST role', () => {
    mockAuthState.role = 'GUEST';
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const { container } = render(<VersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render update banner for SUPER_ADMIN when update available', () => {
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    render(<VersionUpdateBanner />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText(/version\.updateAvailable/)).toBeTruthy();
    expect(screen.getByText('version.viewRelease')).toBeTruthy();
  });

  it('should render update banner for MANAGER role', () => {
    mockAuthState.role = 'MANAGER';
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    render(<VersionUpdateBanner />);

    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('should dismiss banner when X clicked and persist in sessionStorage', () => {
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const { container } = render(<VersionUpdateBanner />);
    expect(screen.getByRole('status')).toBeTruthy();

    const dismissBtn = screen.getByLabelText('version.dismiss');
    fireEvent.click(dismissBtn);

    expect(container.firstChild).toBeNull();
    expect(sessionStorage.setItem).toHaveBeenCalledWith(
      'taskmaster-version-dismissed',
      'true',
    );
  });

  it('should not render if already dismissed in sessionStorage', () => {
    mockSessionStorage['taskmaster-version-dismissed'] = 'true';

    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const { container } = render(<VersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render reload banner when backend was upgraded', () => {
    mockVersionData.backendUpgraded = true;
    mockVersionData.data = {
      currentVersion: '1.1.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      repo: 'mikaYX/taskmaster',
      releaseUrl: null,
      checkedAt: '2026-03-14T12:05:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    render(<VersionUpdateBanner />);

    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('version.reloadRequired')).toBeTruthy();
    expect(screen.getByText('version.reload')).toBeTruthy();
  });

  it('should call window.location.reload when reload button clicked', () => {
    mockVersionData.backendUpgraded = true;
    mockVersionData.data = {
      currentVersion: '1.1.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      repo: 'mikaYX/taskmaster',
      releaseUrl: null,
      checkedAt: '2026-03-14T12:05:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const reloadMock = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadMock },
      writable: true,
    });

    render(<VersionUpdateBanner />);

    fireEvent.click(screen.getByText('version.reload'));
    expect(reloadMock).toHaveBeenCalled();
  });

  it('should render nothing when no update and no backend upgrade', () => {
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      updateAvailable: false,
      repo: 'mikaYX/taskmaster',
      releaseUrl: null,
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    const { container } = render(<VersionUpdateBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('should render release link pointing to GitHub', () => {
    mockVersionData.data = {
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl:
        'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    };

    render(<VersionUpdateBanner />);

    const link = screen.getByText('version.viewRelease');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });
});
