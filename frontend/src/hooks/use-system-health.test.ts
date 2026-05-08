// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemHealth } from './use-system-health';
import { ApiError } from '@/api/http';

vi.mock('@/api/system', () => ({
  systemApi: {
    checkHealth: vi.fn(),
  },
}));

import { systemApi } from '@/api/system';

const mockedCheckHealth = vi.mocked(systemApi.checkHealth);

describe('useSystemHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should treat a 403 health response as backend reachable', async () => {
    mockedCheckHealth.mockRejectedValue(new ApiError(403, 'Forbidden'));

    const { result } = renderHook(() => useSystemHealth());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.status).toBe('ok');
    expect(mockedCheckHealth).toHaveBeenCalledTimes(1);
  });
});
