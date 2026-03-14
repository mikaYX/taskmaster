import { Injectable } from '@nestjs/common';
import { HolidaysResponseDto, Holiday } from './dto';
import Holidays from 'date-holidays';

interface DateHoliday {
  date: string;
  name: string;
  type: string;
}

/**
 * Holidays Service.
 *
 * Returns public holidays for supported countries using date-holidays.
 */
@Injectable()
export class HolidaysService {
  getHolidays(country: string, year: number): HolidaysResponseDto {
    return this.getHolidaysForYear(country, year);
  }

  getHolidaysForYear(country: string, year: number): HolidaysResponseDto {
    const weekStart = ['US', 'CA', 'JP', 'KR'].includes(country)
      ? 'SUNDAY'
      : 'MONDAY';
    let holidays: Holiday[] = [];

    try {
      const hd = new Holidays(country);
      const res = hd.getHolidays(year);
      if (Array.isArray(res)) {
        holidays = (res as DateHoliday[])
          .filter((h) => h.type === 'public')
          .map((h) => ({
            date: h.date.split(' ')[0],
            name: h.name,
          }));
      }
    } catch {
      // Ignore initialisation or parsing errors for unsupported countries
    }

    return {
      country,
      year,
      weekStart,
      holidays,
    };
  }
}
