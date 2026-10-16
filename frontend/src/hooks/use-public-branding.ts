import { useQuery } from '@tanstack/react-query';
import { settingsApi } from '@/api/settings';

/** The application shell needs only the server's explicit public allowlist. */
export function usePublicBranding() {
    const query = useQuery({
        queryKey: ['public-branding'],
        queryFn: settingsApi.getPublicBranding,
        staleTime: 5 * 60 * 1000,
    });
    const getSetting = (key: string): string | undefined => {
        const value = query.data?.[key];
        return typeof value === 'string' ? value : typeof value === 'boolean' ? String(value) : undefined;
    };
    return { ...query, getSetting, getSettingAsBool: (key: string) => getSetting(key) === 'true' };
}
