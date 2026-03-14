import { http } from './http';

export interface Holiday {
    date: string; // YYYY-MM-DD
    name: string;
}

export interface HolidaysResponse {
    country: string;
    year: number;
    weekStart: 'MONDAY' | 'SUNDAY';
    holidays: Holiday[];
}

export interface GetHolidaysParams {
    [key: string]: string | number | boolean | undefined;
    country: string;
    year: number;
}

/**
 * Holidays API module.
 */
export const holidaysApi = {
    /**
     * Get public holidays for a country and year.
     */
    getHolidays: (params: GetHolidaysParams) =>
        http.get<HolidaysResponse>('/holidays', { params }),
};
