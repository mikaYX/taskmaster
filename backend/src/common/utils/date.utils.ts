import Holidays from 'date-holidays';
import {
  addDays,
  isWeekend as isWeekendFns,
  startOfWeek,
  subDays,
  toDate,
} from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

// ==================== CONFIGURATION ====================

const COUNTRY_TIMEZONE: Record<string, string> = {
  FR: 'Europe/Paris',
  US: 'America/New_York', // Default US TZ for now
  GB: 'Europe/London',
  ES: 'Europe/Madrid',
  DE: 'Europe/Berlin',
  RO: 'Europe/Bucharest',
  TN: 'Africa/Tunis',
  CH: 'Europe/Zurich',
  TR: 'Europe/Istanbul',
};

const COUNTRY_TO_HOLIDAY_CODE: Record<string, string> = {
  UK: 'GB',
};

const WEEK_STARTS: Record<string, 0 | 1 | 6> = {
  US: 0, // Sunday
  CA: 0,
  MX: 0,
  // Default is 1 (Monday) for ISO/Europe
};

// ==================== BASIC HELPERS ====================

export function getTimeZoneForCountry(country: string): string {
  return COUNTRY_TIMEZONE[country] || 'UTC';
}

export function nowInTimeZone(country: string): Date {
  const tz = getTimeZoneForCountry(country);
  const now = new Date();
  // This is tricky in JS. We usually want the "Wall Clock" time components.
  // Ideally we keep everything in UTC or Dates, but for "Is today holiday?", inputs are usually Dates.
  return now;
}

export function applyTimeInZone(
  date: Date,
  timeStr: string,
  timezone: string,
): Date {
  const [hours, minutes] = timeStr.split(':').map(Number);
  const zoned = toZonedTime(date, timezone);
  zoned.setHours(hours, minutes, 0, 0);
  return fromZonedTime(zoned, timezone);
}

// ==================== HOLIDAYS & WEEKENDS ====================

const hdCache = new Map<string, Holidays>();

function getHolidayEngine(country: string): Holidays | null {
  const code = COUNTRY_TO_HOLIDAY_CODE[country] || country;
  if (!hdCache.has(code)) {
    try {
      const hd = new Holidays(code);
      hdCache.set(code, hd);
    } catch (e) {
      console.warn(`Could not load holidays for ${country}: ${e.message}`);
      hdCache.set(code, null as any);
    }
  }
  return hdCache.get(code) || null;
}

export function isHoliday(country: string, date: Date): boolean {
  const hd = getHolidayEngine(country);
  if (!hd) return false;
  // ensure we check the date part
  const res = hd.isHoliday(date);
  return !!res; // returns array or false
}

export function isWeekend(date: Date): boolean {
  return isWeekendFns(date);
}

export function isBusinessDay(country: string, date: Date): boolean {
  if (isWeekend(date)) return false;
  if (isHoliday(country, date)) return false;
  return true;
}

// ==================== ANCHORING LOGIC ====================

export function getWeekStart(country: string, date: Date): Date {
  const weekStartDay = WEEK_STARTS[country] ?? 1; // Default Monday
  return startOfWeek(date, { weekStartsOn: weekStartDay });
}

// ==================== SHIFTING LOGIC ====================

export interface ShiftRules {
  skipWeekends: boolean;
  skipHolidays: boolean;
  country: string;
}

/**
 * Shifts a start date forward if it falls on a skipped day.
 */
export function shiftDateForward(date: Date, rules: ShiftRules): Date {
  let current = new Date(date);
  let safety = 0;
  while (safety < 366) {
    let moved = false;

    // 1. Check Weekend
    if (rules.skipWeekends && isWeekend(current)) {
      current = addDays(current, 1);
      moved = true;
      // Loop again to re-check if new day is also weekend/holiday
      continue;
    }

    // 2. Check Holiday
    if (rules.skipHolidays && isHoliday(rules.country, current)) {
      current = addDays(current, 1);
      moved = true;
      continue;
    }

    if (!moved) break;
    safety++;
  }
  return current;
}

/**
 * Shifts an end date backward if it falls on a skipped day.
 */
export function shiftDateBackward(date: Date, rules: ShiftRules): Date {
  let current = new Date(date);
  let safety = 0;
  while (safety < 366) {
    let moved = false;

    if (rules.skipWeekends && isWeekend(current)) {
      current = subDays(current, 1);
      moved = true;
      continue;
    }

    if (rules.skipHolidays && isHoliday(rules.country, current)) {
      current = subDays(current, 1);
      moved = true;
      continue;
    }

    if (!moved) break;
    safety++;
  }
  return current;
}
