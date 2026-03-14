// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useVersionStatus } from './use-version-status';

vi.mock('@/api/system', () => ({
  systemApi: {
    checkHealth: vi.fn(),
    getVersionStatus: vi.fn(),
  },
}));

import { systemApi } from '@/api/system';

const mockedGetVersionStatus = vi.mocked(systemApi.getVersionStatus);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useVersionStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return null data initially while loading', () => {
    mockedGetVersionStatus.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useVersionStatus(), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeNull();
    expect(result.current.isLoading).toBe(true);
    expect(result.current.backendUpgraded).toBe(false);
  });

  it('should return version data after fetch', async () => {
    mockedGetVersionStatus.mockResolvedValue({
      currentVersion: '1.0.0',
      latestVersion: '1.2.0',
      updateAvailable: true,
      repo: 'mikaYX/taskmaster',
      releaseUrl: 'https://github.com/mikaYX/taskmaster/releases/tag/v1.2.0',
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    });

    const { result } = renderHook(() => useVersionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.data!.updateAvailable).toBe(true);
    expect(result.current.data!.latestVersion).toBe('1.2.0');
    expect(result.current.backendUpgraded).toBe(false);
  });

  it('should handle API errors gracefully', async () => {
    mockedGetVersionStatus.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useVersionStatus(), {
      wrapper: createWrapper(),
    });

    await waitFor(
      () => {
        expect(mockedGetVersionStatus).toHaveBeenCalledTimes(2);
      },
      { timeout: 5000 },
    );

    expect(result.current.data).toBeNull();
    expect(result.current.backendUpgraded).toBe(false);
  });

  it('should detect backend upgrade when currentVersion changes', async () => {
    mockedGetVersionStatus.mockResolvedValue({
      currentVersion: '1.0.0',
      latestVersion: '1.0.0',
      updateAvailable: false,
      repo: 'mikaYX/taskmaster',
      releaseUrl: null,
      checkedAt: '2026-03-14T12:00:00.000Z',
      sourceStatus: 'ok',
      error: null,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { result } = renderHook(() => useVersionStatus(), { wrapper });

    await waitFor(() => {
      expect(result.current.data).not.toBeNull();
    });

    expect(result.current.backendUpgraded).toBe(false);

    mockedGetVersionStatus.mockResolvedValue({
      currentVersion: '1.1.0',
      latestVersion: '1.1.0',
      updateAvailable: false,
      repo: 'mikaYX/taskmaster',
      releaseUrl: null,
      checkedAt: '2026-03-14T12:05:00.000Z',
      sourceStatus: 'ok',
      error: null,
    });

    queryClient.invalidateQueries({ queryKey: ['version-status'] });

    await waitFor(() => {
      expect(result.current.data!.currentVersion).toBe('1.1.0');
    });

    expect(result.current.backendUpgraded).toBe(true);
  });
});
