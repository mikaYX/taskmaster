import { useQuery } from '@tanstack/react-query';
import { holidaysApi } from '@/api/holidays';

export const holidayKeys = {
    all: ['holidays'] as const,
    country: (country: string) => [...holidayKeys.all, country] as const,
    countryYear: (country: string, year: number) => [...holidayKeys.country(country), year] as const,
};

export function useHolidays(country: string, year: number, enabled = true) {
    return useQuery({
        queryKey: holidayKeys.countryYear(country, year),
        queryFn: () => holidaysApi.getHolidays({ country, year }),
        enabled,
        staleTime: 0,
        gcTime: 0,
    });
}
