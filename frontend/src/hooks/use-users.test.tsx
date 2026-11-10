import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { usersApi } from '@/api/users';
import { useUpdateUser } from './use-users';

describe('useUpdateUser', () => {
    it('refreshes the own profile page after an account is edited', async () => {
        vi.spyOn(usersApi, 'update').mockResolvedValue({ id: 1 } as never);
        const client = new QueryClient();
        const invalidate = vi.spyOn(client, 'invalidateQueries');
        const wrapper = ({ children }: { children: ReactNode }) => (
            <QueryClientProvider client={client}>{children}</QueryClientProvider>
        );
        const { result } = renderHook(() => useUpdateUser(), { wrapper });

        await act(async () => {
            result.current.mutate({ id: 1, dto: { email: 'admin@example.com' } });
        });

        await waitFor(() =>
            expect(invalidate).toHaveBeenCalledWith({ queryKey: ['own-profile'] }),
        );
    });
});
